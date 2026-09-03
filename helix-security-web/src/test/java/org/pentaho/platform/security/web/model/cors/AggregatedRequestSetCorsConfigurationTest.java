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

package org.pentaho.platform.security.web.model.cors;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.Test;
import org.pentaho.platform.security.web.model.matcher.RegexRequestMatcher;
import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

public class AggregatedRequestSetCorsConfigurationTest {

  private static Set<String> setOf( String... v ) {
    return new LinkedHashSet<>( Arrays.asList( v ) );
  }

  private static HttpServletRequest req( String servletPath ) {
    HttpServletRequest r = mock( HttpServletRequest.class );
    lenient().when( r.getServletPath() ).thenReturn( servletPath );
    lenient().when( r.getPathInfo() ).thenReturn( null );
    lenient().when( r.getMethod() ).thenReturn( "GET" );
    return r;
  }

  private static CorsRequestSetConfigurationPojo root() {
    CorsRequestSetConfigurationPojo root = new CorsRequestSetConfigurationPojo();
    root.setName( CorsRequestSetConfiguration.ROOT_NAME );
    root.setRequestMatcher( RequestMatcher.ALL );
    root.setEnabled( true );
    root.setAllowedOrigins( setOf( "http://allowed.example.com" ) );
    root.setAllowedMethods( setOf( "GET", "HEAD", "POST" ) );
    root.setAllowCredentials( true );
    return root;
  }

  @Test
  public void nothingMatchesWhenNoConfigs() {
    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    assertNull( agg.getRequestConfiguration( req( "/api/x" ) ) );
    assertNull( agg.getRootConfiguration() );
  }

  @Test
  public void abstractRootDoesNotApplyOnItsOwn() {
    CorsRequestSetConfigurationPojo root = root();
    root.setAbstract( true );
    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Collections.singletonList( root ) );

    assertNull( agg.getRequestConfiguration( req( "/api/x" ) ) );
    assertNotNull( agg.getRootConfiguration() );
  }

  @Test
  public void nonAbstractRootAppliesToEverything() {
    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Collections.singletonList( root() ) );

    CorsRequestSetConfiguration effective = agg.getRequestConfiguration( req( "/anything" ) );
    assertNotNull( effective );
    assertEquals( setOf( "http://allowed.example.com" ), effective.getAllowedOrigins() );
    assertTrue( effective.getAllowCredentials() );
  }

  @Test
  public void childInheritsUnsetValuesFromRoot() {
    CorsRequestSetConfigurationPojo child = new CorsRequestSetConfigurationPojo();
    child.setName( "csrf-token" );
    child.setRequestMatcher( new RegexRequestMatcher( "^/api/csrf/token.*" ) );
    child.setEnabled( true );
    child.setExposedHeaders( setOf( "X-CSRF-HEADER", "X-CSRF-PARAM", "X-CSRF-TOKEN" ) );
    // no origins/methods/credentials set -> inherit from root

    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Arrays.asList( root(), child ) );

    CorsRequestSetConfiguration eff = agg.getRequestConfiguration( req( "/api/csrf/token" ) );
    assertNotNull( eff );
    assertEquals( setOf( "http://allowed.example.com" ), eff.getAllowedOrigins() );      // inherited
    assertEquals( setOf( "GET", "HEAD", "POST" ), eff.getAllowedMethods() );             // inherited
    assertEquals( setOf( "X-CSRF-HEADER", "X-CSRF-PARAM", "X-CSRF-TOKEN" ), eff.getExposedHeaders() ); // own
    assertTrue( eff.getAllowCredentials() );                                             // inherited
  }

  @Test
  public void firstMatchingNonAbstractWins() {
    CorsRequestSetConfigurationPojo a = new CorsRequestSetConfigurationPojo();
    a.setName( "a" );
    a.setRequestMatcher( new RegexRequestMatcher( "^/api/.*" ) );
    a.setEnabled( true );
    a.setAllowedOrigins( setOf( "http://a.example.com" ) );

    CorsRequestSetConfigurationPojo b = new CorsRequestSetConfigurationPojo();
    b.setName( "b" );
    b.setRequestMatcher( RequestMatcher.ALL );
    b.setEnabled( true );
    b.setAllowedOrigins( setOf( "http://b.example.com" ) );

    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Arrays.asList( root(), a, b ) );

    assertEquals( setOf( "http://a.example.com" ), agg.getRequestConfiguration( req( "/api/x" ) ).getAllowedOrigins() );
    assertEquals( setOf( "http://b.example.com" ), agg.getRequestConfiguration( req( "/other" ) ).getAllowedOrigins() );
  }

  @Test
  public void disabledConfigIsSkipped() {
    CorsRequestSetConfigurationPojo disabled = new CorsRequestSetConfigurationPojo();
    disabled.setName( "d" );
    disabled.setRequestMatcher( RequestMatcher.ALL );
    disabled.setEnabled( false );
    disabled.setAllowedOrigins( setOf( "http://disabled.example.com" ) );

    AggregatedRequestSetCorsConfiguration agg = new AggregatedRequestSetCorsConfiguration();
    agg.setRequestSetConfigurations( Arrays.asList( disabled, root() ) );

    assertEquals( setOf( "http://allowed.example.com" ),
      agg.getRequestConfiguration( req( "/x" ) ).getAllowedOrigins() );
  }
}
