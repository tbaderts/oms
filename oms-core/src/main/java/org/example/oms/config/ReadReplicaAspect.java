package org.example.oms.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Order(0) // Ensure this runs before @Transactional
public class ReadReplicaAspect {

    @Around("@annotation(UseReadReplica) || @within(UseReadReplica)")
    public Object proceed(ProceedingJoinPoint pjp) throws Throwable {
        try {
            DataSourceContextHolder.setReadReplica();
            return pjp.proceed();
        } finally {
            DataSourceContextHolder.clear();
        }
    }
}
