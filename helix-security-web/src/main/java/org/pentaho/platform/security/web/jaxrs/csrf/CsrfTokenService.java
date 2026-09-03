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
 * log in). Requires the {@code csrfGateFilter} to have run first so the token is on the request.
 * <p>
 * Response: always {@code 204 No Content}. When a token is available, three headers carry it:
 * <pre>
 *   X-CSRF-HEADER: &lt;header name a caller should send the token in, e.g. X-CSRF-TOKEN&gt;
 *   X-CSRF-PARAM:  &lt;form parameter name, e.g. _csrf&gt;
 *   X-CSRF-TOKEN:  &lt;the token value&gt;
 * </pre>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.csrf.jaxrs.CsrfTokenService}.
 */
@Path( "/csrf" )
public class CsrfTokenService {

  static final String RESPONSE_HEADER_HEADER = "X-CSRF-HEADER";
  static final String RESPONSE_HEADER_PARAM = "X-CSRF-PARAM";
  static final String RESPONSE_HEADER_TOKEN = "X-CSRF-TOKEN";

  private final CsrfConfiguration configuration;

  @Context
  private HttpServletRequest request;

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

    if ( configuration != null && configuration.isEnabled() && request != null ) {
      Object attr = request.getAttribute( CsrfToken.class.getName() );
      if ( attr instanceof CsrfToken ) {
        CsrfToken token = (CsrfToken) attr;
        builder
          .header( RESPONSE_HEADER_HEADER, token.getHeaderName() )
          .header( RESPONSE_HEADER_PARAM, token.getParameterName() )
          .header( RESPONSE_HEADER_TOKEN, token.getToken() );
      }
    }

    return builder.build();
  }
}
