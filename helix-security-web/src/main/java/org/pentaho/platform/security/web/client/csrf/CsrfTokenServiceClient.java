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

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.core.Response;

import java.net.URI;

/**
 * Calls the server's {@code /api/csrf/token} endpoint and returns the token to send with a subsequent
 * protected request.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.client.csrf.jaxrsv3.CsrfTokenServiceClient}.
 */
class CsrfTokenServiceClient {

  static final String HEADER_HEADER = "X-CSRF-HEADER";
  static final String HEADER_PARAM = "X-CSRF-PARAM";
  static final String HEADER_TOKEN = "X-CSRF-TOKEN";

  private final Client client;
  private final URI serviceUri;

  CsrfTokenServiceClient( Client client, URI serviceUri ) {
    this.client = client;
    this.serviceUri = serviceUri;
  }

  /** @return the token for {@code targetUri}, or {@code null} if the endpoint returned none. */
  CsrfToken getToken( URI targetUri ) {
    try ( Response response = client.target( serviceUri )
      .queryParam( "url", targetUri.toString() )
      .request()
      .get() ) {

      String header = response.getHeaderString( HEADER_HEADER );
      String param = response.getHeaderString( HEADER_PARAM );
      String token = response.getHeaderString( HEADER_TOKEN );

      if ( token == null || header == null ) {
        return null;
      }
      return new CsrfToken( header, param, token );
    }
  }
}
