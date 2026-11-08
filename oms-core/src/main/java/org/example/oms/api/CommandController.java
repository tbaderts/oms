package org.example.oms.api;

import java.time.Instant;

import org.example.common.api.ExecuteApi;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.CommandResult;
import org.example.common.model.cmd.CommandStatus;
import org.example.oms.service.DuplicateCommandException;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * The command API. Commands are dispatched (and logged) by {@link CommandDispatcher}; this only maps
 * the outcome to an HTTP answer (SPEC-0046):
 *
 * <ul>
 *   <li>applied: 201 when it created an order or an execution, 200 otherwise;
 *   <li>refused: 400, or 409 {@code urn:oms:error:duplicate-command} when the order already applied
 *       the command's commandId;
 *   <li>unsupported type: 501;
 *   <li>an exception: whatever {@link GlobalExceptionHandler} makes of it (409 for a concurrent
 *       modification, 400 for a bad argument, 500 otherwise).
 * </ul>
 */
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/command")
public class CommandController implements ExecuteApi {

    private final CommandDispatcher commandDispatcher;

    @Override
    @Operation(
            summary = "Execute a command",
            requestBody =
                    @RequestBody(
                            content =
                                    @Content(
                                            mediaType = "application/json",
                                            examples = {
                                                @ExampleObject(
                                                        name = "OrderCreateCmd",
                                                        summary = "Order create command",
                                                        value =
                                                                "{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{\"orderId\":null,\"parentOrderId\":null,\"rootOrderId\":null,\"sessionId\":\"test-session\",\"clOrdId\":\"20250621-test-001\",\"sendingTime\":null,\"account\":\"test-account\",\"origClOrdId\":null,\"execInst\":\"NO_CROSS\",\"handlInst\":\"AUTO\",\"securityIdSource\":\"ISIN\",\"orderQty\":100.00,\"cashOrderQty\":null,\"positionEffect\":null,\"securityDesc\":\"desc\",\"securityType\":null,\"maturityMonthYear\":null,\"strikePrice\":null,\"priceType\":\"PER_UNIT\",\"putOrCall\":null,\"underlyingSecurityType\":null,\"ordType\":\"LIMIT\",\"price\":172.06,\"stopPx\":null,\"securityId\":\"US0378331005\",\"side\":\"BUY\",\"symbol\":\"AAPL\",\"timeInForce\":\"DAY\",\"exDestination\":\"XNAS\",\"settlCurrency\":\"USD\",\"expireTime\":null,\"securityExchange\":\"XNAS\",\"text\":\"Test"
                                                                        + " order\"}}"),
                                                @ExampleObject(
                                                        name = "OrderAcceptCmd",
                                                        summary = "Order accept command",
                                                        value =
                                                                "{\"type\":\"OrderAcceptCmd\",\"version\":\"1.0\",\"orderId\":\"12345\"}"),
                                                @ExampleObject(
                                                        name = "OrderCancelRequestCmd",
                                                        summary = "Request cancellation of the open quantity",
                                                        value =
                                                                "{\"type\":\"OrderCancelRequestCmd\",\"version\":\"1.0.0\",\"orderId\":\"12345\"}")
                                            })))
    public ResponseEntity<CommandResult> executeCommand(@Valid Command command) {
        // The SLA clock starts here, at the earliest point in the request we control. Taking it
        // inside a processor would silently exclude whatever the dispatch below costs.
        Instant receivedTime = Instant.now();
        log.info("Received command: {}", command);

        return switch (commandDispatcher.dispatch(command, CommandOrigin.rest(receivedTime))) {
            case CommandDispatch.Applied applied -> ResponseEntity
                    .status(applied.created() ? HttpStatus.CREATED : HttpStatus.OK)
                    .body(result(applied.resultId(), CommandStatus.OK, applied.message()));
            case CommandDispatch.Refused refused when refused.duplicate() ->
                    throw new DuplicateCommandException(refused.orderId(), refused.commandId());
            case CommandDispatch.Refused refused -> {
                log.warn("Command refused: {}", refused.reason());
                yield ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(result(refused.orderId(), CommandStatus.FAILED, refused.message()));
            }
            case CommandDispatch.Unsupported unsupported -> ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                    .body(result(null, CommandStatus.FAILED, "Command type not yet implemented"));
        };
    }

    private static CommandResult result(String id, CommandStatus status, String message) {
        return CommandResult.builder().id(id != null ? id : "").status(status).message(message).build();
    }
}
