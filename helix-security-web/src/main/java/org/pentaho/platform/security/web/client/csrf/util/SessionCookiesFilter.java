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

package org.pentaho.platform.security.web.client.csrf.util;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientRequestFilter;
import jakarta.ws.rs.client.ClientResponseContext;
import jakarta.ws.rs.client.ClientResponseFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MultivaluedMap;

import java.io.IOException;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * JAX-RS client filter that carries cookies (notably {@code JSESSIONID}) across requests made with the
 * same {@link jakarta.ws.rs.client.Client}, using a {@link CookieHandler}. Needed so the CSRF token
 * fetch and the protected request it protects share a session.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.client.csrf.jaxrsv3.util.SessionCookiesFilter}.
 */
@Priority( Priorities.HEADER_DECORATOR + 100 )
public class SessionCookiesFilter implements ClientRequestFilter, ClientResponseFilter {

  private final CookieHandler cookieHandler;

  public SessionCookiesFilter() {
    this( new CookieManager() );
  }

  public SessionCookiesFilter( CookieHandler cookieHandler ) {
    this.cookieHandler = cookieHandler != null ? cookieHandler : new CookieManager();
  }

  @Override
  public void filter( ClientRequestContext requestContext ) throws IOException {
    URI uri = requestContext.getUri();
    Map<String, List<String>> stored = cookieHandler.get( uri, Collections.emptyMap() );

    List<String> cookies = new ArrayList<>();
    for ( Map.Entry<String, List<String>> e : stored.entrySet() ) {
      if ( ( HttpHeaders.COOKIE.equalsIgnoreCase( e.getKey() ) || "Cookie2".equalsIgnoreCase( e.getKey() ) )
        && e.getValue() != null ) {
        cookies.addAll( e.getValue() );
      }
    }
    if ( !cookies.isEmpty() ) {
      requestContext.getHeaders().putSingle( HttpHeaders.COOKIE, String.join( "; ", cookies ) );
    }
  }

  @Override
  public void filter( ClientRequestContext requestContext, ClientResponseContext responseContext )
    throws IOException {
    MultivaluedMap<String, String> headers = responseContext.getHeaders();
    List<String> setCookies = headers.get( HttpHeaders.SET_COOKIE );
    if ( setCookies != null && !setCookies.isEmpty() ) {
      cookieHandler.put( requestContext.getUri(),
        Collections.singletonMap( HttpHeaders.SET_COOKIE, setCookies ) );
    }
  }
}
