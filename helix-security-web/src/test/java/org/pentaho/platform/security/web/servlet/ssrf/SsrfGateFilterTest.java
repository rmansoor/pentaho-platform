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

import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.security.web.model.ssrf.SsrfConfigurationPojo;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.net.URI;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;

/** Replays the SSRF rows of helix-fork/security-web/fixtures/SPEC.md. */
public class SsrfGateFilterTest {

  private SsrfGateFilter enabledFilter;

  @Before
  public void setUp() {
    Set<URI> allowed = new LinkedHashSet<>();
    allowed.add( URI.create( "http://localhost:8080/pentaho/" ) );
    allowed.add( URI.create( "http://127.0.0.1:8080/pentaho/" ) );
    enabledFilter = new SsrfGateFilter( new SsrfConfigurationPojo( allowed, true ) );
  }

  private static MockHttpServletRequest request( String host, int port ) {
    MockHttpServletRequest r = new MockHttpServletRequest( "GET", "/api/version/show" );
    r.setScheme( "http" );
    r.setServerName( host );
    r.setServerPort( port );
    return r;
  }

  private static int run( SsrfGateFilter filter, MockHttpServletRequest req ) throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    filter.doFilter( req, res, new MockFilterChain() );
    return res.getStatus();
  }

  @Test
  public void validHostPasses() throws Exception {
    assertEquals( 200, run( enabledFilter, request( "localhost", 8080 ) ) );
  }

  @Test
  public void alternativeHostPasses() throws Exception {
    assertEquals( 200, run( enabledFilter, request( "127.0.0.1", 8080 ) ) );
  }

  @Test
  public void bogusHostIsForbidden() throws Exception {
    assertEquals( 403, run( enabledFilter, request( "evil.example.com", 8080 ) ) );
  }

  @Test
  public void rightHostWrongPortIsForbidden() throws Exception {
    assertEquals( 403, run( enabledFilter, request( "localhost", 9999 ) ) );
  }

  @Test
  public void forwardedHostIsNotTrusted() throws Exception {
    MockHttpServletRequest req = request( "localhost", 8080 );
    req.addHeader( "X-Forwarded-Host", "evil.example.com" );
    // real Host is valid -> passes; the forwarded header must not sway the decision either way
    assertEquals( 200, run( enabledFilter, req ) );
  }

  @Test
  public void forwardedHostCannotRescueABadHost() throws Exception {
    MockHttpServletRequest req = request( "evil.example.com", 8080 );
    req.addHeader( "X-Forwarded-Host", "localhost:8080" );
    assertEquals( 403, run( enabledFilter, req ) );
  }

  @Test
  public void disabledFilterPassesEverything() throws Exception {
    Set<URI> allowed = new LinkedHashSet<>();
    allowed.add( URI.create( "http://localhost:8080/pentaho/" ) );
    SsrfGateFilter disabled = new SsrfGateFilter( new SsrfConfigurationPojo( allowed, false ) );
    assertEquals( 200, run( disabled, request( "evil.example.com", 8080 ) ) );
  }

  @Test
  public void defaultPortNormalisation() throws Exception {
    Set<URI> allowed = new LinkedHashSet<>();
    allowed.add( URI.create( "http://example.com/pentaho/" ) ); // no explicit port -> 80
    SsrfGateFilter filter = new SsrfGateFilter( new SsrfConfigurationPojo( allowed, true ) );

    MockHttpServletRequest req = request( "example.com", 80 );
    assertEquals( 200, run( filter, req ) );
    assertEquals( 403, run( filter, request( "example.com", 8080 ) ) );
  }
}
