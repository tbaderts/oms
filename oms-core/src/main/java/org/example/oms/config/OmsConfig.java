package org.example.oms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class OmsConfig {

    @Bean
    public OtlpGrpcSpanExporter otlpHttpSpanExporter(@Value("${tracing.url}") String url) {
        return OtlpGrpcSpanExporter.builder().setEndpoint(url).build();
    }
}
