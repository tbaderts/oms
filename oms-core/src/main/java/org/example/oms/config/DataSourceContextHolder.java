package org.example.oms.config;

public class DataSourceContextHolder {

    private static final ThreadLocal<Boolean> contextHolder = new ThreadLocal<>();

    public static void setReadReplica() {
        contextHolder.set(true);
    }

    public static void clear() {
        contextHolder.remove();
    }

    public static boolean isReadReplica() {
        return contextHolder.get() != null && contextHolder.get();
    }
}
