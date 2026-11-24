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

package org.pentaho.platform.web.http.security;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

public class WebSecurityExtensionFilterTest {

  private final ServletRequest request = mock( ServletRequest.class );
  private final ServletResponse response = mock( ServletResponse.class );

  @Test
  public void emptySlotPassesThrough() throws Exception {
    FilterChain chain = mock( FilterChain.class );
    new WebSecurityExtensionFilter( List::of, () -> true ).doFilter( request, response, chain );
    verify( chain ).doFilter( request, response );
  }

  @Test
  public void runsPublishedFiltersInOrderThenTheChain() throws Exception {
    List<String> trace = new ArrayList<>();
    Filter a = ( req, res, ch ) -> {
      trace.add( "a" );
      ch.doFilter( req, res );
    };
    Filter b = ( req, res, ch ) -> {
      trace.add( "b" );
      ch.doFilter( req, res );
    };
    FilterChain chain = ( req, res ) -> trace.add( "chain" );

    new WebSecurityExtensionFilter( () -> List.of( a, b ), () -> true ).doFilter( request, response, chain );

    assertEquals( List.of( "a", "b", "chain" ), trace );
  }

  @Test
  public void aPublishedFilterCanStopTheChain() throws Exception {
    HttpServletResponse httpResponse = mock( HttpServletResponse.class );
    Filter deny = ( req, res, ch ) -> ( (HttpServletResponse) res ).sendError( 403 );
    FilterChain chain = mock( FilterChain.class );

    new WebSecurityExtensionFilter( () -> List.of( deny ), () -> true ).doFilter( request, httpResponse, chain );

    verify( httpResponse ).sendError( 403 );
    verifyNoInteractions( chain );
  }

  @Test
  public void doesNotCacheUntilThePlatformIsUp() {
    AtomicInteger lookups = new AtomicInteger();
    AtomicBoolean up = new AtomicBoolean( false );
    WebSecurityExtensionFilter filter = new WebSecurityExtensionFilter( () -> {
      lookups.incrementAndGet();
      return List.of();
    }, up::get );

    filter.getFilters();
    filter.getFilters();
    assertEquals( 2, lookups.get() );

    up.set( true );
    filter.getFilters();
    filter.getFilters();
    assertEquals( 3, lookups.get() );

    filter.invalidate();
    filter.getFilters();
    assertEquals( 4, lookups.get() );
  }

  @Test
  public void nullLookupIsEmpty() {
    WebSecurityExtensionFilter filter = new WebSecurityExtensionFilter( () -> null, () -> false );
    assertTrue( filter.getFilters().isEmpty() );
    assertFalse( filter.getFilters() == null );
  }
}
