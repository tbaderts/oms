package org.example.oms.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.example.common.model.cmd.CommandStatus;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.web.servlet.MockMvc;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CommandControllerWebMvcTest {

    private MockMvc mockMvc;

        @Mock
    private OrderCreateCommandProcessor orderCreateCommandProcessor;

        @Mock
    private OrderAcceptCommandProcessor orderAcceptCommandProcessor;

        @Mock
    private ExecutionCommandProcessor executionCommandProcessor;

        @Mock
    private OrderMapper orderMapper;

        @InjectMocks
        private CommandController commandController;

        @BeforeEach
        void setup() {
                mockMvc = MockMvcBuilders.standaloneSetup(commandController)
                                .setControllerAdvice(new GlobalExceptionHandler())
                                .build();
        }

    @Test
    void executeCommand_withOrderCreateCmd_returnsCreated() throws Exception {
        var result =
                OrderCreateCommandProcessor.OrderCreateResult.builder()
                        .success(true)
                        .orderId("ORD-100")
                        .executionTimeMs(10)
                        .build();
        when(orderCreateCommandProcessor.process(any())).thenReturn(result);

        mockMvc.perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{\"clOrdId\":\"C1\",\"symbol\":\"AAPL\",\"account\":\"A1\",\"ordType\":\"LIMIT\",\"orderQty\":1,\"price\":1,\"side\":\"BUY\"}}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("ORD-100"))
                .andExpect(jsonPath("$.status").value(CommandStatus.OK.name()));
    }

    @Test
    void executeCommand_withUnknownType_returnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"UnknownCmd\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeCommand_withOrderAcceptCmd_returnsOk() throws Exception {
        var result = OrderAcceptCommandProcessor.OrderAcceptResult.builder()
                .success(true)
                .orderId("ORD-101")
                .build();
        when(orderAcceptCommandProcessor.process(any())).thenReturn(result);

        mockMvc.perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"OrderAcceptCmd\",\"orderId\":\"ORD-101\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("ORD-101"))
                .andExpect(jsonPath("$.status").value(CommandStatus.OK.name()));
    }

}
