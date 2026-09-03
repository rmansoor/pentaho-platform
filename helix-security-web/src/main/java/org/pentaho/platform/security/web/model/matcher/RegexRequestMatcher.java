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

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Matches a request whose <em>context-relative</em> path ({@code servletPath + pathInfo}) matches a
 * regular expression, optionally restricted to a set of HTTP methods.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.model.matcher.RegexRequestMatcher}.
 * Behaviour reproduced from the observable contract: the pattern is tested against
 * {@code getServletPath() + getPathInfo()} (already stripped of the context path by the container),
 * {@code insensitive} maps to {@link Pattern#CASE_INSENSITIVE}, and an empty/absent method set means
 * "any method".
 */
public class RegexRequestMatcher implements RequestMatcher {

  private final Pattern pattern;
  private final Set<String> methods;

  public RegexRequestMatcher( String pattern ) {
    this( pattern, null, false );
  }

  public RegexRequestMatcher( String pattern, Collection<String> methods ) {
    this( pattern, methods, false );
  }

  public RegexRequestMatcher( String pattern, Collection<String> methods, boolean insensitive ) {
    if ( pattern == null || pattern.isEmpty() ) {
      throw new IllegalArgumentException( "The argument 'pattern' is empty." );
    }

    this.pattern = insensitive ? Pattern.compile( pattern, Pattern.CASE_INSENSITIVE ) : Pattern.compile( pattern );

    if ( methods == null || methods.isEmpty() ) {
      this.methods = Collections.emptySet();
    } else {
      Set<String> upper = new LinkedHashSet<>();
      for ( String m : methods ) {
        if ( m != null && !m.isBlank() ) {
          upper.add( m.trim().toUpperCase( Locale.ROOT ) );
        }
      }
      this.methods = Collections.unmodifiableSet( upper );
    }
  }

  @Override
  public boolean test( HttpServletRequest request ) {
    if ( request == null ) {
      return false;
    }

    if ( !methods.isEmpty() ) {
      String method = request.getMethod();
      if ( method == null || !methods.contains( method.toUpperCase( Locale.ROOT ) ) ) {
        return false;
      }
    }

    String servletPath = request.getServletPath();
    String pathInfo = request.getPathInfo();
    String path = ( servletPath == null ? "" : servletPath ) + ( pathInfo == null ? "" : pathInfo );

    return pattern.matcher( path ).matches();
  }

  Pattern getPattern() {
    return pattern;
  }

  Set<String> getMethods() {
    return methods;
  }

  @Override
  public String toString() {
    return "RegexRequestMatcher[pattern=" + pattern + ", methods=" + methods + "]";
  }
}
