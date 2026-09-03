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

package org.pentaho.platform.security.web.servlet.ssrf;

import jakarta.servlet.http.HttpServletRequest;

import java.net.URI;
import java.util.Locale;

/**
 * Origin normalisation for SSRF protection.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.service.util.SsrfUtil}. An
 * "origin" here is {@code scheme://host:port} with the default port made explicit and everything
 * lower-cased, so two spellings of the same origin compare equal.
 */
public final class SsrfUtil {

  private SsrfUtil() {
  }

  public static int defaultPort( String scheme ) {
    if ( scheme == null ) {
      return -1;
    }
    switch ( scheme.toLowerCase( Locale.ROOT ) ) {
      case "http":
        return 80;
      case "https":
        return 443;
      default:
        return -1;
    }
  }

  /** {@code scheme://host:port}, default port made explicit, lower-cased; {@code null} if incomplete. */
  public static String normalizeOrigin( String scheme, String host, int port ) {
    if ( scheme == null || host == null || host.isBlank() ) {
      return null;
    }
    String s = scheme.toLowerCase( Locale.ROOT );
    String h = host.toLowerCase( Locale.ROOT );
    int p = port > 0 ? port : defaultPort( s );
    return s + "://" + h + ":" + p;
  }

  /** Normalise the origin of a URI (e.g. a configured fully-qualified server URL). */
  public static String normalizeOrigin( URI uri ) {
    if ( uri == null ) {
      return null;
    }
    return normalizeOrigin( uri.getScheme(), uri.getHost(), uri.getPort() );
  }

  /**
   * The origin the request claims to be for, from the {@code Host} header (via
   * {@link HttpServletRequest#getServerName()}/{@link HttpServletRequest#getServerPort()}) and the
   * request scheme. Forwarded headers are deliberately ignored.
   */
  public static String requestOrigin( HttpServletRequest request ) {
    return normalizeOrigin( request.getScheme(), request.getServerName(), request.getServerPort() );
  }
}
