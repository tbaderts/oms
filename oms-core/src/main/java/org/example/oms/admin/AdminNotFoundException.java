package org.example.oms.admin;

import java.util.NoSuchElementException;

/**
 * An outbox message or dead-letter topic asked for by id or name that is not there (SPEC-0075); the
 * operator API answers 404. Its own type, so that a {@link NoSuchElementException} from a programming
 * error elsewhere still surfaces as a server error rather than a misleading 404.
 */
public class AdminNotFoundException extends NoSuchElementException {

    public AdminNotFoundException(String message) {
        super(message);
    }
}
