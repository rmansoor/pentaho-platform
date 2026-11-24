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

package org.pentaho.platform.security.web.servlet.cors;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.pentaho.platform.security.web.model.cors.CorsConfiguration;
import org.springframework.web.filter.CorsFilter;

import java.io.IOException;

/**
 * Handles CORS pre-flight ({@code OPTIONS}) and actual cross-origin requests according to the
 * aggregated {@link CorsConfiguration}. A disallowed origin, method, or header yields {@code 403};
 * an allowed request is annotated with the {@code Access-Control-*} headers and passed on.
 * <p>
 * Wraps Spring's {@link CorsFilter} with a {@link CorsConfigurationSourceAdapter}. Clean-room
 * replacement for {@code com.hitachivantara.security.web.impl.service.cors.servlet.CorsProtocolFilter}.
 * Runs after the CSRF gate in {@code filterChainProxy}.
 */
public class CorsProtocolFilter implements Filter {

  private final CorsFilter innerFilter;

  public CorsProtocolFilter( CorsConfiguration configuration ) {
    this.innerFilter = new CorsFilter( new CorsConfigurationSourceAdapter( configuration ) );
  }

  @Override
  public void init( FilterConfig filterConfig ) throws ServletException {
    innerFilter.init( filterConfig );
  }

  @Override
  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
    throws IOException, ServletException {
    innerFilter.doFilter( request, response, chain );
  }

  @Override
  public void destroy() {
    innerFilter.destroy();
  }
}
