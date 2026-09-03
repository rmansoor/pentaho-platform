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

package org.pentaho.platform.security.web.jaxrs.csrf;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import org.pentaho.platform.security.web.model.csrf.CsrfConfiguration;
import org.springframework.security.web.csrf.CsrfToken;

/**
 * JAX-RS resource that hands a caller the current CSRF token so it can make a protected request.
 * Exposed at {@code /api/csrf/token}; must be reachable without authentication (a token is needed to
 * log in).
 * <p>
 * The {@code csrfGateFilter} must run ahead of this resource in the filter chain: when CSRF protection
 * is enabled it places a {@link CsrfToken} on the request, and this resource simply reflects it; when
 * CSRF is disabled the filter short-circuits, no token is placed, and this resource returns an empty
 * {@code 204}. So the response is:
 * <pre>
 *   204 No Content, always
 *   X-CSRF-HEADER: &lt;header name to send the token in, e.g. X-CSRF-TOKEN&gt;   (only when protected)
 *   X-CSRF-PARAM:  &lt;form parameter name, e.g. _csrf&gt;                        (only when protected)
 *   X-CSRF-TOKEN:  &lt;the token value&gt;                                        (only when protected)
 * </pre>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.csrf.jaxrs.CsrfTokenService}.
 */
@Path( "/csrf" )
public class CsrfTokenService {

  static final String RESPONSE_HEADER_HEADER = "X-CSRF-HEADER";
  static final String RESPONSE_HEADER_PARAM = "X-CSRF-PARAM";
  static final String RESPONSE_HEADER_TOKEN = "X-CSRF-TOKEN";

  @SuppressWarnings( "unused" )
  private final CsrfConfiguration configuration;

  @Context
  private HttpServletRequest request;

  /**
   * No-arg constructor for the JAX-RS runtime's own class scan. The resource does not need the
   * {@link CsrfConfiguration} &mdash; whether a token is available is already decided by the
   * {@code csrfGateFilter} upstream.
   */
  public CsrfTokenService() {
    this( null );
  }

  public CsrfTokenService( CsrfConfiguration configuration ) {
    this.configuration = configuration;
  }

  /** Test seam. */
  void setRequest( HttpServletRequest request ) {
    this.request = request;
  }

  @GET
  @Path( "/token" )
  public Response getToken( @QueryParam( "url" ) String url ) {
    Response.ResponseBuilder builder = Response.noContent();

    Object attr = request == null ? null : request.getAttribute( CsrfToken.class.getName() );
    if ( attr instanceof CsrfToken ) {
      CsrfToken token = (CsrfToken) attr;
      builder
        .header( RESPONSE_HEADER_HEADER, token.getHeaderName() )
        .header( RESPONSE_HEADER_PARAM, token.getParameterName() )
        .header( RESPONSE_HEADER_TOKEN, token.getToken() );
    }

    return builder.build();
  }
}
