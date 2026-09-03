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

package org.pentaho.platform.security.web.jaxrs.csrf;

import jakarta.ws.rs.core.Response;
import org.junit.Test;
import org.pentaho.platform.security.web.model.csrf.AggregatedRequestSetCsrfConfiguration;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.DefaultCsrfToken;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class CsrfTokenServiceTest {

  private static AggregatedRequestSetCsrfConfiguration enabled() {
    AggregatedRequestSetCsrfConfiguration c = new AggregatedRequestSetCsrfConfiguration();
    c.setEnabled( true );
    return c;
  }

  private static CsrfTokenService service( AggregatedRequestSetCsrfConfiguration cfg, CsrfToken tokenAttr ) {
    CsrfTokenService s = new CsrfTokenService( cfg );
    MockHttpServletRequest req = new MockHttpServletRequest( "GET", "/api/csrf/token" );
    if ( tokenAttr != null ) {
      req.setAttribute( CsrfToken.class.getName(), tokenAttr );
    }
    s.setRequest( req );
    return s;
  }

  @Test
  public void emitsTheThreeHeadersWhenATokenIsPresent() {
    CsrfToken token = new DefaultCsrfToken( "X-CSRF-TOKEN", "_csrf", "the-token-value" );
    Response res = service( enabled(), token ).getToken( "http://localhost:8080/pentaho/api/repo/files/import" );

    assertEquals( 204, res.getStatus() );
    assertEquals( "X-CSRF-TOKEN", res.getHeaderString( "X-CSRF-HEADER" ) );
    assertEquals( "_csrf", res.getHeaderString( "X-CSRF-PARAM" ) );
    assertEquals( "the-token-value", res.getHeaderString( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void stillTwoZeroFourWithoutTheUrlParam() {
    CsrfToken token = new DefaultCsrfToken( "X-CSRF-TOKEN", "_csrf", "abc" );
    Response res = service( enabled(), token ).getToken( null );
    assertEquals( 204, res.getStatus() );
    assertEquals( "abc", res.getHeaderString( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void noTokenOnTheRequestMeansNoHeaders() {
    // csrfGateFilter short-circuits when CSRF is disabled -> no CsrfToken attribute -> empty 204
    Response res = service( enabled(), null ).getToken( null );
    assertEquals( 204, res.getStatus() );
    assertNull( res.getHeaderString( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void reflectsTheTokenEvenWithNoInjectedConfiguration() {
    // the JAX-RS runtime may build the resource via its no-arg constructor
    CsrfTokenService s = new CsrfTokenService();
    MockHttpServletRequest req = new MockHttpServletRequest( "GET", "/api/csrf/token" );
    req.setAttribute( CsrfToken.class.getName(), new DefaultCsrfToken( "X-CSRF-TOKEN", "_csrf", "abc" ) );
    s.setRequest( req );

    Response res = s.getToken( null );
    assertEquals( 204, res.getStatus() );
    assertEquals( "abc", res.getHeaderString( "X-CSRF-TOKEN" ) );
  }
}
