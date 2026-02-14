package org.example.oms.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Method;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;

class DataSourceRoutingTest {

    @AfterEach
    void cleanup() {
        DataSourceContextHolder.clear();
    }

    @Test
    void routingDataSource_usesWriteByDefaultAndReadWhenContextSet() throws Exception {
        DataSource writeDataSource = Mockito.mock(DataSource.class);
        DataSource readDataSource = Mockito.mock(DataSource.class);

        DataSourceConfig config = new DataSourceConfig();
        AbstractRoutingDataSource routingDataSource =
                (AbstractRoutingDataSource) config.dataSource(writeDataSource, readDataSource);

        Method determineCurrentLookupKey =
                routingDataSource.getClass().getDeclaredMethod("determineCurrentLookupKey");
        determineCurrentLookupKey.setAccessible(true);

        Object defaultKey = determineCurrentLookupKey.invoke(routingDataSource);
        assertEquals("write", defaultKey);

        DataSourceContextHolder.setReadReplica();
        Object readKey = determineCurrentLookupKey.invoke(routingDataSource);
        assertEquals("read", readKey);
    }
}
