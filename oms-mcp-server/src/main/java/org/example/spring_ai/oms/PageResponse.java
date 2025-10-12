package org.example.spring_ai.oms;

import java.util.List;

/**
 * Simple pagination response wrapper.
 *
 * @param <T> the type of elements in the page
 */
public class PageResponse<T> {
    private final List<T> content;
    private final int pageNumber;
    private final int pageSize;
    private final long totalElements;
    private final long totalPages;

    public PageResponse(List<T> content, int pageNumber, int pageSize, long totalElements, long totalPages) {
        this.content = content;
        this.pageNumber = pageNumber;
        this.pageSize = pageSize;
        this.totalElements = totalElements;
        this.totalPages = totalPages;
    }

    public List<T> getContent() {
        return content;
    }

    public int getPageNumber() {
        return pageNumber;
    }

    public int getPageSize() {
        return pageSize;
    }

    public long getTotalElements() {
        return totalElements;
    }

    public long getTotalPages() {
        return totalPages;
    }

    @Override
    public String toString() {
        return "PageResponse{" +
                "pageNumber=" + pageNumber +
                ", pageSize=" + pageSize +
                ", totalElements=" + totalElements +
                ", totalPages=" + totalPages +
                ", contentSize=" + (content != null ? content.size() : 0) +
                '}';
    }
}
