package org.example.spring_ai.oms;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.lang.NonNull;

public class LoggingInterceptor implements ClientHttpRequestInterceptor {
    private static final Logger log = LoggerFactory.getLogger(LoggingInterceptor.class);

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
