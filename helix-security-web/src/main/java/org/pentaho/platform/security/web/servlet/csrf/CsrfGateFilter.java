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

package org.pentaho.platform.security.web.servlet.csrf;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.pentaho.platform.security.web.model.csrf.CsrfConfiguration;
import org.pentaho.platform.security.web.servlet.util.HttpUtil;
import org.pentaho.platform.security.web.servlet.util.ManagedBodyServletRequestWrapper;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Servlet filter that rejects an unsafe request to a CSRF-protected endpoint unless it carries a valid
 * CSRF token. Wraps Spring Security's {@link CsrfFilter}: this class contributes the Helix
 * request-set model (via {@link CsrfRequiredRequestMatcherAdapter}) and buffers the request body for
 * body-bearing methods so a downstream matcher (e.g. GWT-RPC method matching) can inspect it and the
 * target servlet can still read it.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.csrf.servlet.CsrfGateFilter}. Should be the first
 * filter after the SSRF gate. Token: header {@code X-CSRF-TOKEN} or parameter {@code _csrf}.
 */
public class CsrfGateFilter implements Filter {

  private final CsrfConfiguration configuration;
  private final CsrfFilter innerFilter;
  private Set<String> parseBodyMethods = new LinkedHashSet<>( HttpUtil.DEFAULT_PARSE_BODY_METHODS );

  public CsrfGateFilter( CsrfConfiguration configuration ) {
    this( configuration, new HttpSessionCsrfTokenRepository() );
  }

  public CsrfGateFilter( CsrfConfiguration configuration, CsrfTokenRepository tokenRepository ) {
    this.configuration = configuration;
    this.innerFilter = new CsrfFilter( tokenRepository );
    this.innerFilter.setRequireCsrfProtectionMatcher( new CsrfRequiredRequestMatcherAdapter( configuration ) );
  }

  protected CsrfFilter getInnerFilter() {
    return innerFilter;
  }

  public CsrfConfiguration getConfiguration() {
    return configuration;
  }

  public Set<String> getParseBodyMethods() {
    return parseBodyMethods;
  }

  public void setParseBodyMethods( Set<String> parseBodyMethods ) {
    this.parseBodyMethods = parseBodyMethods == null
      ? new LinkedHashSet<>( HttpUtil.DEFAULT_PARSE_BODY_METHODS )
      : new LinkedHashSet<>( parseBodyMethods );
  }

  public void setParseBodyMethods( String csv ) {
    Set<String> set = new LinkedHashSet<>();
    if ( csv != null ) {
      for ( String s : csv.split( "[\\s,;]+" ) ) {
        if ( !s.isBlank() ) {
          set.add( s.trim().toUpperCase( java.util.Locale.ROOT ) );
        }
      }
    }
    setParseBodyMethods( set );
  }

  public void setAccessDeniedHandler( AccessDeniedHandler accessDeniedHandler ) {
    innerFilter.setAccessDeniedHandler( accessDeniedHandler );
  }

  @Override
  public void init( FilterConfig filterConfig ) throws ServletException {
    innerFilter.init( filterConfig );
  }

  @Override
  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
    throws IOException, ServletException {

    if ( !configuration.isEnabled() || !( request instanceof HttpServletRequest ) ) {
      chain.doFilter( request, response );
      return;
    }

    HttpServletRequest wrapped = ManagedBodyServletRequestWrapper.wrap( (HttpServletRequest) request, parseBodyMethods );
    innerFilter.doFilter( wrapped, response, chain );
  }

  @Override
  public void destroy() {
    innerFilter.destroy();
  }
}
