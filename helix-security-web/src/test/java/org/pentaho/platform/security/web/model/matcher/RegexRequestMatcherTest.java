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

package org.pentaho.platform.security.web.model.matcher;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.Test;

import java.util.Arrays;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class RegexRequestMatcherTest {

  private static HttpServletRequest request( String method, String servletPath, String pathInfo ) {
    HttpServletRequest req = mock( HttpServletRequest.class );
    lenient().when( req.getMethod() ).thenReturn( method );
    lenient().when( req.getServletPath() ).thenReturn( servletPath );
    lenient().when( req.getPathInfo() ).thenReturn( pathInfo );
    return req;
  }

  @Test
  public void matchesFullContextRelativePath() {
    RegexRequestMatcher m = new RegexRequestMatcher( "^/api/user-settings/.*" );
    assertTrue( m.test( request( "GET", "/api/user-settings/recent", null ) ) );
    assertTrue( m.test( request( "POST", "/api/user-settings", "/favorites" ) ) );
    assertFalse( m.test( request( "GET", "/api/other", null ) ) );
  }

  @Test
  public void anchorsToWholePath() {
    // ".matches()" semantics: pattern must cover the entire path
    RegexRequestMatcher m = new RegexRequestMatcher( "/api/theme/set" );
    assertTrue( m.test( request( "POST", "/api/theme/set", null ) ) );
    assertFalse( m.test( request( "POST", "/api/theme/set/extra", null ) ) );
  }

  @Test
  public void restrictsByMethodWhenGiven() {
    RegexRequestMatcher m = new RegexRequestMatcher( "^/api/.*", Arrays.asList( "POST" ) );
    assertTrue( m.test( request( "post", "/api/x", null ) ) );
    assertFalse( m.test( request( "GET", "/api/x", null ) ) );
  }

  @Test
  public void emptyMethodSetMeansAnyMethod() {
    RegexRequestMatcher m = new RegexRequestMatcher( "^/api/.*", java.util.Collections.emptyList() );
    assertTrue( m.test( request( "DELETE", "/api/x", null ) ) );
  }

  @Test
  public void insensitiveFlag() {
    assertFalse( new RegexRequestMatcher( "^/API/.*" ).test( request( "GET", "/api/x", null ) ) );
    assertTrue( new RegexRequestMatcher( "^/API/.*", null, true ).test( request( "GET", "/api/x", null ) ) );
  }

  @Test
  public void rejectsEmptyPattern() {
    assertThrows( IllegalArgumentException.class, () -> new RegexRequestMatcher( "" ) );
    assertThrows( IllegalArgumentException.class, () -> new RegexRequestMatcher( null ) );
  }

  @Test
  public void constantsBehaveAsAdvertised() {
    when( mock( HttpServletRequest.class ).getMethod() ).thenReturn( "GET" );
    assertTrue( RequestMatcher.ALL.test( mock( HttpServletRequest.class ) ) );
    assertFalse( RequestMatcher.NONE.test( mock( HttpServletRequest.class ) ) );
  }
}
