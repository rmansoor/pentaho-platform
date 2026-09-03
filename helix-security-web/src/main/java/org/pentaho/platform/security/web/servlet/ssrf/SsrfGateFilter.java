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

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.pentaho.platform.security.web.model.ssrf.SsrfConfiguration;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Rejects a request whose declared origin (from the {@code Host} header and the request scheme) is not
 * one of the server's own fully-qualified URLs. This defends server-side code that reflects the
 * request host into an outgoing URL against a spoofed {@code Host}.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.ssrf.servlet.SsrfGateFilter}. First filter in
 * {@code filterChainProxy}, ahead of CSRF and authentication. Forwarded headers are not trusted.
 * Rejection is {@code 403} with an empty body.
 */
public class SsrfGateFilter implements Filter {

  private final SsrfConfiguration configuration;
  private final Set<String> allowedOrigins;

  public SsrfGateFilter( SsrfConfiguration configuration ) {
    this.configuration = configuration;
    this.allowedOrigins = new LinkedHashSet<>();
    if ( configuration != null && configuration.getAllowedOrigins() != null ) {
      for ( URI uri : configuration.getAllowedOrigins() ) {
        String origin = SsrfUtil.normalizeOrigin( uri );
        if ( origin != null ) {
          allowedOrigins.add( origin );
        }
      }
    }
  }

  Set<String> getAllowedOrigins() {
    return allowedOrigins;
  }

  @Override
  public void init( FilterConfig filterConfig ) {
    // nothing
  }

  @Override
  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
    throws IOException, ServletException {

    if ( configuration == null || !configuration.isEnabled()
      || !( request instanceof HttpServletRequest ) || !( response instanceof HttpServletResponse ) ) {
      chain.doFilter( request, response );
      return;
    }

    String origin = SsrfUtil.requestOrigin( (HttpServletRequest) request );
    if ( origin != null && allowedOrigins.contains( origin ) ) {
      chain.doFilter( request, response );
      return;
    }

    ( (HttpServletResponse) response ).sendError( HttpServletResponse.SC_FORBIDDEN );
  }

  @Override
  public void destroy() {
    // nothing
  }
}
