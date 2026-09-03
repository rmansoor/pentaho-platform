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

import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.security.web.model.cors.AggregatedRequestSetCorsConfiguration;
import org.pentaho.platform.security.web.model.cors.CorsRequestSetConfigurationPojo;
import org.pentaho.platform.security.web.model.matcher.RegexRequestMatcher;
import org.pentaho.platform.security.web.model.matcher.RequestMatcher;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Arrays;
import java.util.LinkedHashSet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Replays the CORS rows of helix-fork/security-web/fixtures/SPEC.md. */
public class CorsProtocolFilterTest {

  private CorsProtocolFilter filter;

  @Before
  public void setUp() {
    CorsRequestSetConfigurationPojo root = new CorsRequestSetConfigurationPojo();
    root.setName( "root" );
    root.setRequestMatcher( RequestMatcher.ALL );
    root.setEnabled( true );
    root.setAllowedOrigins( new LinkedHashSet<>( Arrays.asList( "http://allowed.example.com" ) ) );
    root.setAllowedMethods( new LinkedHashSet<>( Arrays.asList( "GET", "HEAD", "POST" ) ) );
    root.setAllowCredentials( true );

    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( java.util.Collections.singletonList( root ) );
    filter = new CorsProtocolFilter( agg );
  }

  private static MockHttpServletRequest req( String method, String path ) {
    MockHttpServletRequest r = new MockHttpServletRequest( method, path );
    r.setServletPath( path );
    return r;
  }

  private MockHttpServletResponse run( MockHttpServletRequest req ) throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    filter.doFilter( req, res, new MockFilterChain() );
    return res;
  }

  @Test
  public void preflightAllowedOriginAndMethod() throws Exception {
    MockHttpServletRequest req = req( "OPTIONS", "/api/version/show" );
    req.addHeader( "Origin", "http://allowed.example.com" );
    req.addHeader( "Access-Control-Request-Method", "POST" );

    MockHttpServletResponse res = run( req );
    assertEquals( 200, res.getStatus() );
    assertEquals( "http://allowed.example.com", res.getHeader( "Access-Control-Allow-Origin" ) );
    assertEquals( "true", res.getHeader( "Access-Control-Allow-Credentials" ) );
    assertTrue( res.getHeader( "Access-Control-Allow-Methods" ).contains( "POST" ) );
    assertTrue( res.getHeaders( "Vary" ).contains( "Origin" ) );
  }

  @Test
  public void preflightEchoesRequestedHeaders() throws Exception {
    MockHttpServletRequest req = req( "OPTIONS", "/api/version/show" );
    req.addHeader( "Origin", "http://allowed.example.com" );
    req.addHeader( "Access-Control-Request-Method", "POST" );
    req.addHeader( "Access-Control-Request-Headers", "X-CSRF-TOKEN, Content-Type" );

    String allowHeaders = run( req ).getHeader( "Access-Control-Allow-Headers" );
    assertTrue( allowHeaders.contains( "X-CSRF-TOKEN" ) );
    assertTrue( allowHeaders.contains( "Content-Type" ) );
  }

  @Test
  public void preflightDisallowedMethodIsForbidden() throws Exception {
    MockHttpServletRequest req = req( "OPTIONS", "/api/version/show" );
    req.addHeader( "Origin", "http://allowed.example.com" );
    req.addHeader( "Access-Control-Request-Method", "PUT" );
    assertEquals( 403, run( req ).getStatus() );
  }

  @Test
  public void preflightDeniedOriginIsForbidden() throws Exception {
    MockHttpServletRequest req = req( "OPTIONS", "/api/version/show" );
    req.addHeader( "Origin", "http://evil.example.com" );
    req.addHeader( "Access-Control-Request-Method", "POST" );

    MockHttpServletResponse res = run( req );
    assertEquals( 403, res.getStatus() );
    assertNull( res.getHeader( "Access-Control-Allow-Origin" ) );
  }

  @Test
  public void actualRequestAllowedOriginGetsCorsHeaders() throws Exception {
    MockHttpServletRequest req = req( "GET", "/api/version/show" );
    req.addHeader( "Origin", "http://allowed.example.com" );

    MockHttpServletResponse res = run( req );
    assertEquals( 200, res.getStatus() );
    assertEquals( "http://allowed.example.com", res.getHeader( "Access-Control-Allow-Origin" ) );
    assertEquals( "true", res.getHeader( "Access-Control-Allow-Credentials" ) );
  }

  @Test
  public void actualRequestDeniedOriginIsForbidden() throws Exception {
    MockHttpServletRequest req = req( "GET", "/api/version/show" );
    req.addHeader( "Origin", "http://evil.example.com" );
    assertEquals( 403, run( req ).getStatus() );
  }

  @Test
  public void noOriginHeaderIsUntouched() throws Exception {
    MockHttpServletResponse res = run( req( "GET", "/api/version/show" ) );
    assertEquals( 200, res.getStatus() );
    assertNull( res.getHeader( "Access-Control-Allow-Origin" ) );
  }

  @Test
  public void childConfigNarrowsForItsEndpoint() throws Exception {
    CorsRequestSetConfigurationPojo root = new CorsRequestSetConfigurationPojo();
    root.setName( "root" );
    root.setRequestMatcher( RequestMatcher.ALL );
    root.setEnabled( true );
    root.setAbstract( true ); // only children allow CORS
    root.setAllowedMethods( new LinkedHashSet<>( Arrays.asList( "GET", "HEAD", "POST" ) ) );
    root.setAllowCredentials( true );

    CorsRequestSetConfigurationPojo child = new CorsRequestSetConfigurationPojo();
    child.setName( "csrf-token" );
    child.setRequestMatcher( new RegexRequestMatcher( "^/api/csrf/token\\b.*" ) );
    child.setEnabled( true );
    child.setAllowedOrigins( new LinkedHashSet<>( Arrays.asList( "http://allowed.example.com" ) ) );

    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Arrays.asList( root, child ) );
    filter = new CorsProtocolFilter( agg );

    MockHttpServletRequest ok = req( "GET", "/api/csrf/token" );
    ok.addHeader( "Origin", "http://allowed.example.com" );
    assertEquals( "http://allowed.example.com", run( ok ).getHeader( "Access-Control-Allow-Origin" ) );

    // an endpoint with no child config: abstract root does not allow CORS -> denied
    MockHttpServletRequest other = req( "GET", "/api/version/show" );
    other.addHeader( "Origin", "http://allowed.example.com" );
    assertEquals( 403, run( other ).getStatus() );
  }
}
