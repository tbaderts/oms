package org.example.oms.service.leadership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/**
 * SPEC-0048, from the review of leader handover: a session that no longer answers is closed before a
 * new one is opened, so it cannot keep the lock while nobody leads; and the dedicated connection
 * detects a dead peer instead of holding the lock for hours.
 */
class LeadershipConnectionTest {

    @Test
    void aStaleSessionIsClosedBeforeANewOneIsOpened() throws Exception {
        Connection stale = lockingConnection();
        Connection fresh = lockingConnection();
        when(stale.isValid(anyInt())).thenReturn(false); // it stopped answering after taking the lock
        Deque<Connection> connections = new ArrayDeque<>(java.util.List.of(stale, fresh));
        Leadership leadership = new Leadership(connections::pop);

        assertTrue(leadership.holds(Role.OUTBOX_RELAY));
        assertTrue(leadership.holds(Role.OUTBOX_RELAY), "re-taken on a fresh session");

        InOrder order = inOrder(stale, fresh);
        order.verify(stale).close();
        order.verify(fresh).prepareStatement(anyString());
    }

    @Test
    void theDedicatedConnectionDetectsADeadPeer() {
        Properties properties = Leadership.connectionProperties("oms", "secret");

        assertEquals("oms", properties.getProperty("user"));
        assertEquals("true", properties.getProperty("tcpKeepAlive"));
        assertTrue(Integer.parseInt(properties.getProperty("socketTimeout")) > 0, "a hung server cannot block the check");
    }

    private static Connection lockingConnection() throws Exception {
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet result = mock(ResultSet.class);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(result);
        when(result.next()).thenReturn(true);
        when(result.getBoolean(1)).thenReturn(true);
        when(connection.isValid(anyInt())).thenReturn(true);
        return connection;
    }
}
