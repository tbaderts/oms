package org.example.spring_ai.oms;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(OmsClientProperties.class)
public class RestClientConfig {

    @Bean
    public RestClient omsRestClient(OmsClientProperties props, RestClient.Builder builder) {
        builder.baseUrl(props.baseUrl());
        builder.requestInterceptor(new LoggingInterceptor());
        return builder.build();
    }
}
