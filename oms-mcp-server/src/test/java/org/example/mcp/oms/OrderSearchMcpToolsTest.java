package org.example.mcp.oms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.example.common.model.query.Side;
import org.example.common.model.query.State;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderSearchMcpToolsTest {

    @Mock
    private OrderQueryClient orderQueryClient;

    private OrderSearchMcpTools tools;

    @BeforeEach
    void setUp() {
        tools = new OrderSearchMcpTools(orderQueryClient);
    }

    private PageResponse<Map<String, Object>> emptyPage() {
        return new PageResponse<>(List.of(), 0, 20, 0, 0);
    }

    @Nested
    class SearchOrders {

        @Test
        void shouldDelegateToClient() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), anyString()))
                    .thenReturn(emptyPage());

            var result = tools.searchOrders(null, 0, 10, "id,DESC");

            assertThat(result.content()).isEmpty();
            assertThat(result.totalElements()).isEqualTo(0);
        }

        @Test
        void shouldMapFiltersToQueryParams() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), any()))
                    .thenReturn(emptyPage());

            var filters = new OrderSearchMcpTools.OrderSearchFilters(
                    "O-123", null, null, null, null,
                    "ACC-1", "AAPL", null, null,
                    null, null, null, null, null, null,
                    null, null, null, null,
                    null, null, null,
                    Side.BUY, null, State.LIVE, null);

            tools.searchOrders(filters, 0, 10, null);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
            verify(orderQueryClient).search(captor.capture(), anyInt(), anyInt(), any());

            Map<String, Object> params = captor.getValue();
            assertThat(params).containsEntry("orderId", "O-123");
            assertThat(params).containsEntry("account", "ACC-1");
            assertThat(params).containsEntry("symbol", "AAPL");
            assertThat(params).containsEntry("side", "BUY");
            assertThat(params).containsEntry("state", "LIVE");
        }

        @Test
        void shouldClampNegativePage() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), any()))
                    .thenReturn(emptyPage());

            tools.searchOrders(null, -1, 10, null);

            ArgumentCaptor<Integer> pageCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(orderQueryClient).search(any(), pageCaptor.capture(), anyInt(), any());
            assertThat(pageCaptor.getValue()).isEqualTo(0);
        }

        @Test
        void shouldClampExcessivePageSize() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), any()))
                    .thenReturn(emptyPage());

            tools.searchOrders(null, 0, 9999, null);

            ArgumentCaptor<Integer> sizeCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(orderQueryClient).search(any(), anyInt(), sizeCaptor.capture(), any());
            assertThat(sizeCaptor.getValue()).isEqualTo(500);
        }

        @Test
        void shouldUseDefaultsForNullPagination() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), any()))
                    .thenReturn(emptyPage());

            tools.searchOrders(null, null, null, null);

            ArgumentCaptor<Integer> pageCaptor = ArgumentCaptor.forClass(Integer.class);
            ArgumentCaptor<Integer> sizeCaptor = ArgumentCaptor.forClass(Integer.class);
            verify(orderQueryClient).search(any(), pageCaptor.capture(), sizeCaptor.capture(), any());
            assertThat(pageCaptor.getValue()).isEqualTo(0);
            assertThat(sizeCaptor.getValue()).isEqualTo(20);
        }

        @Test
        void shouldHandleNullFilters() {
            when(orderQueryClient.search(any(), anyInt(), anyInt(), any()))
                    .thenReturn(emptyPage());

            var result = tools.searchOrders(null, 0, 10, null);

            assertThat(result).isNotNull();
        }
    }
}
