package org.example.oms.archive;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The archive replica (SPEC-0052), when {@code oms.replica.enabled} is true. Off by default: without
 * a replica, nothing is archived ({@link RetentionJob}).
 */
@Configuration
@ConditionalOnProperty(name = "oms.replica.enabled", havingValue = "true")
public class ReplicaConfig {

    @Bean(destroyMethod = "close")
    ReplicaDatabase replicaDatabase(
            @Value("${oms.replica.url}") String url,
            @Value("${oms.replica.username}") String username,
            @Value("${oms.replica.password}") String password,
            @Value("${oms.replica.primary-conninfo}") String primaryConninfo,
            @Value("${oms.replica.subscription:oms_history}") String subscription) {
        return new ReplicaDatabase(new ReplicaDatabase.ReplicaProperties(url, username, password, primaryConninfo, subscription));
    }

    @Bean
    ReplicaSchema replicaSchema(ReplicaDatabase replica) {
        return new ReplicaSchema(replica);
    }
}
