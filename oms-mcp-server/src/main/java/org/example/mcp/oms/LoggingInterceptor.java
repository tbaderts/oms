package org.example.mcp.oms;

import java.io.IOException;

import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.lang.NonNull;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LoggingInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public @NonNull ClientHttpResponse intercept(@NonNull HttpRequest request, @NonNull byte[] body, @NonNull ClientHttpRequestExecution execution) throws IOException {
        log.info("Request: {} {}", request.getMethod(), request.getURI());
        log.debug("Request headers: {}", request.getHeaders());
        if (body.length > 0 && log.isDebugEnabled()) {
            log.debug("Request body: {}", new String(body));
        }
        ClientHttpResponse response = execution.execute(request, body);
        log.info("Response: {} {}", response.getStatusCode(), response.getStatusText());
        log.debug("Response headers: {}", response.getHeaders());
        return response;
    }
}
