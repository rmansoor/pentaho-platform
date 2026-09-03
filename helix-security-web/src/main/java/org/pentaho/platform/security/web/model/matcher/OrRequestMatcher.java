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

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * Disjunction of request matchers &mdash; matches when <em>any</em> delegate matches.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.model.matcher.OrRequestMatcher}.
 * An empty delegate list matches nothing.
 */
public class OrRequestMatcher implements RequestMatcher {

  private final List<RequestMatcher> matchers;

  public OrRequestMatcher( Collection<? extends RequestMatcher> matchers ) {
    this.matchers = matchers == null
      ? Collections.emptyList()
      : Collections.unmodifiableList( new ArrayList<>( matchers ) );
  }

  @Override
  public boolean test( HttpServletRequest request ) {
    for ( RequestMatcher matcher : matchers ) {
      if ( matcher.test( request ) ) {
        return true;
      }
    }
    return false;
  }

  List<RequestMatcher> getMatchers() {
    return matchers;
  }

  @Override
  public String toString() {
    return "OrRequestMatcher" + matchers;
  }
}
