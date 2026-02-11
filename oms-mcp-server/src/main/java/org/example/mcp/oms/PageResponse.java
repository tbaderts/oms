package org.example.mcp.oms;

import java.util.List;

/**
 * Simple pagination response wrapper.
 *
 * @param content       the page content
 * @param pageNumber    current page number (0-based)
 * @param pageSize      number of items per page
 * @param totalElements total number of matching elements
 * @param totalPages    total number of pages
 * @param <T>           the type of elements in the page
 */
public record PageResponse<T>(
        List<T> content,
        int pageNumber,
        int pageSize,
        long totalElements,
        long totalPages
) {

    /**
     * @deprecated Use {@link #content()} instead.
     */
    @Deprecated(forRemoval = true)
    public List<T> getContent() {
        return content;
    }

    /**
     * @deprecated Use {@link #pageNumber()} instead.
     */
    @Deprecated(forRemoval = true)
    public int getPageNumber() {
        return pageNumber;
    }

    /**
     * @deprecated Use {@link #pageSize()} instead.
     */
    @Deprecated(forRemoval = true)
    public int getPageSize() {
        return pageSize;
    }

    /**
     * @deprecated Use {@link #totalElements()} instead.
     */
    @Deprecated(forRemoval = true)
    public long getTotalElements() {
        return totalElements;
    }

    /**
     * @deprecated Use {@link #totalPages()} instead.
     */
    @Deprecated(forRemoval = true)
    public long getTotalPages() {
        return totalPages;
    }
}
