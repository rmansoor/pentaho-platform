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

package org.pentaho.platform.web.http.filters;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.springframework.core.io.FileSystemResourceLoader;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockFilterConfig;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockServletContext;

import java.io.File;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ConsolePageFilterTest {

  @Rule
  public TemporaryFolder webapp = new TemporaryFolder();

  private ConsolePageFilter filter;

  @Before
  public void setUp() throws Exception {
    File console = webapp.newFolder( "console" );
    Files.writeString( console.toPath().resolve( "index.html" ), "<!doctype html>" );
    filter = filterOver( webapp.getRoot() );
  }

  private static ConsolePageFilter filterOver( File root ) {
    MockServletContext context = new MockServletContext( "file:" + root.getAbsolutePath(), new FileSystemResourceLoader() );
    ConsolePageFilter f = new ConsolePageFilter();
    f.init( new MockFilterConfig( context ) );
    return f;
  }

  private static MockHttpServletRequest get( String path ) {
    MockHttpServletRequest req = new MockHttpServletRequest( "GET", "/pentaho" + path );
    req.setContextPath( "/pentaho" );
    return req;
  }

  @Test
  public void forwardsConsoleAddressesToThePage() throws Exception {
    for ( String path : new String[] { "/console/", "/console/datasets", "/console/datasets/new", "/console/files", "/console/admin/" } ) {
      MockHttpServletResponse res = new MockHttpServletResponse();
      MockFilterChain chain = new MockFilterChain();
      filter.doFilter( get( path ), res, chain );
      assertEquals( path, ConsolePageFilter.PAGE, res.getForwardedUrl() );
      assertNull( path, chain.getRequest() );
      assertEquals( "no-cache", res.getHeader( "Cache-Control" ) );
    }
  }

  @Test
  public void servesFilesAsTheyAre() throws Exception {
    for ( String path : new String[] { "/console/assets/index-3f9a.js", "/console/favicon.svg", "/console/assets/fonts" } ) {
      MockHttpServletResponse res = new MockHttpServletResponse();
      MockFilterChain chain = new MockFilterChain();
      filter.doFilter( get( path ), res, chain );
      assertNull( path, res.getForwardedUrl() );
      assertTrue( path, chain.getRequest() != null );
      assertNull( path, res.getHeader( "Cache-Control" ) );
    }
  }

  @Test
  public void keepsThePageItselfFromBeingCached() throws Exception {
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    filter.doFilter( get( "/console/index.html" ), res, chain );
    assertNull( res.getForwardedUrl() );
    assertTrue( chain.getRequest() != null );
    assertEquals( "no-cache", res.getHeader( "Cache-Control" ) );
  }

  @Test
  public void leavesOtherRequestsAlone() throws Exception {
    MockHttpServletRequest post = get( "/console/datasets" );
    post.setMethod( "POST" );
    MockHttpServletResponse res = new MockHttpServletResponse();
    filter.doFilter( post, res, new MockFilterChain() );
    assertNull( res.getForwardedUrl() );

    res = new MockHttpServletResponse();
    filter.doFilter( get( "/consoles/x" ), res, new MockFilterChain() );
    assertNull( res.getForwardedUrl() );
  }

  @Test
  public void doesNothingWhenTheConsoleIsNotInstalled() throws Exception {
    ConsolePageFilter without = filterOver( webapp.newFolder( "empty" ) );
    MockHttpServletResponse res = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();
    without.doFilter( get( "/console/datasets" ), res, chain );
    assertNull( res.getForwardedUrl() );
    assertTrue( chain.getRequest() != null );
  }

  @Test
  public void tellsPagesFromFiles() {
    assertTrue( ConsolePageFilter.isPage( "" ) );
    assertTrue( ConsolePageFilter.isPage( "datasets/new" ) );
    assertFalse( ConsolePageFilter.isPage( "assets/app.js" ) );
    assertFalse( ConsolePageFilter.isPage( "assets/fonts" ) );
    assertFalse( ConsolePageFilter.isPage( "favicon.svg" ) );
  }
}
