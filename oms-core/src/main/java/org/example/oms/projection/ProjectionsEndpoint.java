package org.example.oms.projection;

import java.util.Map;

import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.Selector;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.actuate.endpoint.web.WebEndpointResponse;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Operator trigger for {@link ProjectionRebuilder} (SPEC-0020):
 * {@code POST /actuator/projections/{name}/rebuild}. Exposed like the other management endpoints,
 * which have no authentication today; that was accepted at proposal approval.
 */
@Component
@Endpoint(id = "projections")
@RequiredArgsConstructor
public class ProjectionsEndpoint {

    private static final String REBUILD = "rebuild";

    private final ProjectionRebuilder rebuilder;

    @WriteOperation
    public WebEndpointResponse<Map<String, Object>> rebuild(@Selector String name, @Selector String action) {
        if (!REBUILD.equals(action)) {
            return new WebEndpointResponse<>(Map.of("error", "Unknown action: " + action), WebEndpointResponse.STATUS_BAD_REQUEST);
        }
        if (!rebuilder.exists(name)) {
            return new WebEndpointResponse<>(Map.of("error", "Unknown projection: " + name), WebEndpointResponse.STATUS_NOT_FOUND);
        }
        int rows = rebuilder.rebuild(name);
        return new WebEndpointResponse<>(Map.of("projection", name, "rows", rows));
    }
}
