package org.example.oms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@SpringBootApplication
@EnableJpaRepositories("org.example.oms.service.infra.repository")
@EntityScan({"org.example.common.model", "org.example.oms.model"})
@EnableTransactionManagement
@ComponentScan(basePackages = {"org.example.oms", "org.example.common"})
public class OmsApplication {

    public static void main(String[] args) {
        SpringApplication.run(OmsApplication.class, args);
    }
}
