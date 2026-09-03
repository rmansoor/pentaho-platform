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

package org.pentaho.platform.security.web.spring;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.pentaho.platform.security.web.model.csrf.CsrfRequestSetConfigurationPojo;
import org.pentaho.platform.security.web.model.matcher.OrRequestMatcher;
import org.pentaho.platform.security.web.model.matcher.RegexRequestMatcher;
import org.pentaho.platform.security.web.model.matcher.RequestMatcher;
import org.springframework.context.support.ClassPathXmlApplicationContext;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

/**
 * Loads a Spring XML that uses every {@code hsw:} element and asserts the resulting matcher beans.
 * Also proves {@code META-INF/spring.handlers} / {@code spring.schemas} resolve on the classpath.
 */
public class SecurityWebNamespaceHandlerTest {

  private static ClassPathXmlApplicationContext ctx;

  @BeforeClass
  public static void load() {
    ctx = new ClassPathXmlApplicationContext(
      "org/pentaho/platform/security/web/spring/namespace-test-context.xml" );
  }

  @AfterClass
  public static void close() {
    if ( ctx != null ) {
      ctx.close();
    }
  }

  private static HttpServletRequest req( String method, String servletPath ) {
    HttpServletRequest r = mock( HttpServletRequest.class );
    lenient().when( r.getMethod() ).thenReturn( method );
    lenient().when( r.getServletPath() ).thenReturn( servletPath );
    lenient().when( r.getPathInfo() ).thenReturn( null );
    return r;
  }

  private static RequestMatcher matcherOf( String beanId ) {
    return ( (CsrfRequestSetConfigurationPojo) ctx.getBean( beanId ) ).getRequestMatcher();
  }

  @Test
  public void regexElement() {
    RequestMatcher m = matcherOf( "regex" );
    assertTrue( m instanceof RegexRequestMatcher );
    assertTrue( m.test( req( "POST", "/api/user-settings/recent" ) ) );
    assertFalse( m.test( req( "GET", "/api/user-settings/recent" ) ) );
  }

  @Test
  public void allElementResolvesToConstant() {
    assertSame( RequestMatcher.ALL, matcherOf( "all" ) );
    assertTrue( matcherOf( "all" ).test( req( "GET", "/anything" ) ) );
  }

  @Test
  public void noneElementResolvesToConstant() {
    assertSame( RequestMatcher.NONE, matcherOf( "none" ) );
    assertFalse( matcherOf( "none" ).test( req( "GET", "/anything" ) ) );
  }

  @Test
  public void orElementNestsChildren() {
    RequestMatcher m = matcherOf( "or" );
    assertTrue( m instanceof OrRequestMatcher );
    assertTrue( m.test( req( "POST", "/api/theme/set" ) ) );
    assertTrue( m.test( req( "POST", "/UploadService" ) ) );
    assertFalse( m.test( req( "POST", "/api/other" ) ) );
    assertFalse( m.test( req( "GET", "/api/theme/set" ) ) );
  }
}
