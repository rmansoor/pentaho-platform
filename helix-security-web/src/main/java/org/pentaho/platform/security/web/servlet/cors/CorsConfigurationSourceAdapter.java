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

import jakarta.servlet.http.HttpServletRequest;
import org.pentaho.platform.security.web.model.cors.CorsRequestSetConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Adapts a Helix {@link org.pentaho.platform.security.web.model.cors.CorsConfiguration} to Spring's
 * {@link CorsConfigurationSource}, so it can drive {@link org.springframework.web.filter.CorsFilter}.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.model.spring.CorsConfigurationSourceAdapter}.
 */
public class CorsConfigurationSourceAdapter implements CorsConfigurationSource {

  private final org.pentaho.platform.security.web.model.cors.CorsConfiguration configuration;

  public CorsConfigurationSourceAdapter(
    org.pentaho.platform.security.web.model.cors.CorsConfiguration configuration ) {
    this.configuration = configuration;
  }

  /** An empty configuration: a cross-origin request that reaches it is rejected. */
  private static final org.springframework.web.cors.CorsConfiguration DENY =
    new org.springframework.web.cors.CorsConfiguration();

  @Override
  public org.springframework.web.cors.CorsConfiguration getCorsConfiguration( HttpServletRequest request ) {
    if ( configuration == null || !configuration.isEnabled() ) {
      // CORS disabled entirely — no processing, request passes through untouched
      return null;
    }
    CorsRequestSetConfiguration effective = configuration.getRequestConfiguration( request );
    if ( effective == null ) {
      // CORS is enabled but nothing allows CORS for this endpoint — deny any cross-origin request
      return DENY;
    }
    return toSpring( effective );
  }

  static org.springframework.web.cors.CorsConfiguration toSpring( CorsRequestSetConfiguration in ) {
    org.springframework.web.cors.CorsConfiguration out = new org.springframework.web.cors.CorsConfiguration();

    out.setAllowedOrigins( toList( in.getAllowedOrigins() ) );

    List<String> methods = toList( in.getAllowedMethods() );
    out.setAllowedMethods( methods == null || methods.isEmpty() ? null : methods );

    List<String> headers = toList( in.getAllowedHeaders() );
    // no explicit allow-list -> reflect whatever the client asks for
    out.setAllowedHeaders( headers == null || headers.isEmpty() ? List.of( "*" ) : headers );

    List<String> exposed = toList( in.getExposedHeaders() );
    if ( exposed != null && !exposed.isEmpty() ) {
      out.setExposedHeaders( exposed );
    }

    out.setAllowCredentials( in.getAllowCredentials() );
    out.setMaxAge( in.getMaxAge() );
    return out;
  }

  private static List<String> toList( Set<String> set ) {
    return set == null ? null : new ArrayList<>( set );
  }
}
