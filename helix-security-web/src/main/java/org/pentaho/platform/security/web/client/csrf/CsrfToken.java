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

/**
 * A CSRF token as returned by the server's token endpoint: the value plus the header/parameter names
 * to send it back in.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.client.csrf.jaxrsv3.CsrfToken}.
 */
public final class CsrfToken {

  private final String headerName;
  private final String parameterName;
  private final String token;

  public CsrfToken( String headerName, String parameterName, String token ) {
    this.headerName = headerName;
    this.parameterName = parameterName;
    this.token = token;
  }

  public String getHeaderName() {
    return headerName;
  }

  public String getParameterName() {
    return parameterName;
  }

  public String getToken() {
    return token;
  }
}
