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

import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.security.web.model.csrf.AggregatedRequestSetCsrfConfiguration;
import org.pentaho.platform.security.web.model.csrf.CsrfRequestSetConfigurationPojo;
import org.pentaho.platform.security.web.model.matcher.RegexRequestMatcher;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class CsrfGateFilterTest {

  private AggregatedRequestSetCsrfConfiguration config;
  private HttpSessionCsrfTokenRepository repo;
  private CsrfGateFilter filter;

  @Before
  public void setUp() {
    config = new AggregatedRequestSetCsrfConfiguration();
    config.setEnabled( true );
    config.setRequestSetConfigurations( Collections.singletonList(
      new CsrfRequestSetConfigurationPojo(
        new RegexRequestMatcher( "^/api/repo/files/import\\b.*", java.util.List.of( "POST" ) ) ) ) );

    repo = new HttpSessionCsrfTokenRepository();
    filter = new CsrfGateFilter( config, repo );
    // use the plain (non-XOR) handler so tests can inject a known raw token value;
    // XOR masking is Spring Security's own concern and is covered by S10's black-box replay
    filter.getInnerFilter().setRequestHandler( new CsrfTokenRequestAttributeHandler() );
  }

  /** Like a real container: put the path in servletPath (what RegexRequestMatcher reads). */
  private static MockHttpServletRequest request( String method, String path ) {
    MockHttpServletRequest req = new MockHttpServletRequest( method, path );
    req.setServletPath( path );
    return req;
  }

  private MockHttpServletResponse run( MockHttpServletRequest req ) throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    filter.doFilter( req, res, chain );
    return res;
  }

  @Test
  public void disabledConfigPassesEverythingThrough() throws Exception {
    config.setEnabled( false );
    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    assertEquals( 200, run( req ).getStatus() );
  }

  @Test
  public void unprotectedEndpointPassesThrough() throws Exception {
    MockHttpServletRequest req = request( "POST", "/api/not-protected" );
    assertEquals( 200, run( req ).getStatus() );
  }

  @Test
  public void protectedPostWithoutTokenIsForbidden() throws Exception {
    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    assertEquals( 403, run( req ).getStatus() );
  }

  @Test
  public void protectedPostWithValidHeaderTokenPasses() throws Exception {
    MockHttpServletRequest tokenReq = request( "GET", "/api/csrf/token" );
    CsrfToken token = repo.generateToken( tokenReq );
    MockHttpServletResponse tokenRes = new MockHttpServletResponse();
    repo.saveToken( token, tokenReq, tokenRes );

    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    req.setSession( tokenReq.getSession() );
    req.addHeader( "X-CSRF-TOKEN", token.getToken() );
    assertEquals( 200, run( req ).getStatus() );
  }

  @Test
  public void protectedPostWithWrongTokenIsForbidden() throws Exception {
    MockHttpServletRequest tokenReq = request( "GET", "/api/csrf/token" );
    CsrfToken token = repo.generateToken( tokenReq );
    repo.saveToken( token, tokenReq, new MockHttpServletResponse() );

    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    req.setSession( tokenReq.getSession() );
    req.addHeader( "X-CSRF-TOKEN", "not-the-token" );
    assertEquals( 403, run( req ).getStatus() );
  }

  @Test
  public void tokenAcceptedViaFormParameter() throws Exception {
    MockHttpServletRequest tokenReq = request( "GET", "/api/csrf/token" );
    CsrfToken token = repo.generateToken( tokenReq );
    repo.saveToken( token, tokenReq, new MockHttpServletResponse() );

    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    req.setSession( tokenReq.getSession() );
    req.setContentType( "application/x-www-form-urlencoded" );
    req.addParameter( "_csrf", token.getToken() );
    assertEquals( 200, run( req ).getStatus() );
  }

  @Test
  public void getMatchersAreEnforced() throws Exception {
    config.setRequestSetConfigurations( Collections.singletonList( new CsrfRequestSetConfigurationPojo(
      new RegexRequestMatcher( "^/api/system/refresh/metadata\\b.*", null ) ) ) );

    assertEquals( 403, run( request( "GET", "/api/system/refresh/metadata" ) ).getStatus() );
  }

  @Test
  public void methodOutsideMatcherIsNotChallenged() throws Exception {
    // the import matcher is POST-only, so a GET to the same path is not protected
    assertEquals( 200, run( request( "GET", "/api/repo/files/import" ) ).getStatus() );
  }

  @Test
  public void rawBodyRemainsReadableDownstream() throws Exception {
    MockHttpServletRequest tokenReq = request( "GET", "/api/csrf/token" );
    CsrfToken token = repo.generateToken( tokenReq );
    repo.saveToken( token, tokenReq, new MockHttpServletResponse() );

    MockHttpServletRequest req = request( "POST", "/api/repo/files/import" );
    req.setSession( tokenReq.getSession() );
    req.addHeader( "X-CSRF-TOKEN", token.getToken() );
    req.setContentType( "text/x-gwt-rpc" );
    req.setContent( "7|0|4|http://x/|hash|iface|method|1|2|3|4|".getBytes() );

    MockHttpServletResponse res = new MockHttpServletResponse();
    final String[] downstreamBody = new String[ 1 ];
    MockFilterChain chain = new MockFilterChain( new jakarta.servlet.http.HttpServlet() {
      @Override protected void service( jakarta.servlet.http.HttpServletRequest r,
                                        jakarta.servlet.http.HttpServletResponse s ) throws java.io.IOException {
        downstreamBody[ 0 ] = new String( r.getInputStream().readAllBytes() );
      }
    } );
    filter.doFilter( req, res, chain );

    assertEquals( 200, res.getStatus() );
    assertNotNull( "downstream servlet must have run and read the body", downstreamBody[ 0 ] );
    assertEquals( "7|0|4|http://x/|hash|iface|method|1|2|3|4|", downstreamBody[ 0 ] );
  }
}
