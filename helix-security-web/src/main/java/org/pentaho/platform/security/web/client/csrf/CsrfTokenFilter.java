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

package org.pentaho.platform.security.web.client.csrf;

import jakarta.annotation.Priority;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientRequestFilter;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * JAX-RS client filter: before an unsafe request, fetches a CSRF token from the server's token
 * endpoint and adds it to the outgoing request. Register it on a {@link Client} alongside
 * {@link org.pentaho.platform.security.web.client.csrf.util.SessionCookiesFilter} so the token and the
 * real request share a session.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.client.csrf.jaxrsv3.CsrfTokenFilter}.
 */
@Priority( Priorities.HEADER_DECORATOR )
public class CsrfTokenFilter implements ClientRequestFilter {

  private static final Set<String> SAFE_METHODS = Set.of( "GET", "HEAD", "OPTIONS", "TRACE" );

  private final URI serviceUri;

  public CsrfTokenFilter( URI serviceUri ) {
    this.serviceUri = serviceUri;
  }

  @Override
  public void filter( ClientRequestContext requestContext ) {
    String method = requestContext.getMethod();
    if ( method != null && SAFE_METHODS.contains( method.toUpperCase( Locale.ROOT ) ) ) {
      return;
    }
    if ( isRequestForTokenService( requestContext ) ) {
      return;
    }

    // Reuse the request's own Client so the token call shares the session (SessionCookiesFilter).
    Client client = requestContext.getClient();
    CsrfToken token = getServiceClient( client ).getToken( requestContext.getUri() );
    if ( token != null && token.getToken() != null ) {
      requestContext.getHeaders().putSingle( token.getHeaderName(), token.getToken() );
    }
  }

  private boolean isRequestForTokenService( ClientRequestContext ctx ) {
    URI target = ctx.getUri();
    return target != null && target.getPath() != null
      && serviceUri.getPath() != null
      && target.getPath().equals( serviceUri.getPath() );
  }

  CsrfTokenServiceClient getServiceClient( Client client ) {
    return new CsrfTokenServiceClient( client, serviceUri );
  }
}
