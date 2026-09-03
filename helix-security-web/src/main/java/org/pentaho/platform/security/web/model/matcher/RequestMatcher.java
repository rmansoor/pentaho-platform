/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.model.matcher;

import jakarta.servlet.http.HttpServletRequest;

import java.util.function.Predicate;

/**
 * Tests whether an {@link HttpServletRequest} belongs to a set.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.matcher.RequestMatcher}.
 * The contract is exactly {@code Predicate<HttpServletRequest>} plus the two well-known constants.
 */
public interface RequestMatcher extends Predicate<HttpServletRequest> {

  /** Matches every request. */
  RequestMatcher ALL = new RequestMatcher() {
    @Override public boolean test( HttpServletRequest request ) {
      return true;
    }

    @Override public String toString() {
      return "RequestMatcher.ALL";
    }
  };

  /** Matches no request. */
  RequestMatcher NONE = new RequestMatcher() {
    @Override public boolean test( HttpServletRequest request ) {
      return false;
    }

    @Override public String toString() {
      return "RequestMatcher.NONE";
    }
  };
}
