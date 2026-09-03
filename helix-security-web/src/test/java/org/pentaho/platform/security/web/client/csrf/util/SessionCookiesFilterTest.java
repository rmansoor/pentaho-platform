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

package org.pentaho.platform.security.web.client.csrf.util;

import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.client.ClientResponseContext;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import org.junit.Test;

import java.net.CookieManager;
import java.net.URI;
import java.util.List;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class SessionCookiesFilterTest {

  private static final URI URL = URI.create( "http://localhost:8080/pentaho/api/csrf/token" );

  @Test
  public void storesSetCookieThenSendsItBack() throws Exception {
    SessionCookiesFilter filter = new SessionCookiesFilter( new CookieManager() );

    // response with a Set-Cookie
    ClientRequestContext req1 = mock( ClientRequestContext.class );
    when( req1.getUri() ).thenReturn( URL );
    ClientResponseContext res1 = mock( ClientResponseContext.class );
    MultivaluedMap<String, String> resHeaders = new MultivaluedHashMap<>();
    resHeaders.add( "Set-Cookie", "JSESSIONID=ABC123; Path=/pentaho; HttpOnly" );
    when( res1.getHeaders() ).thenReturn( resHeaders );
    filter.filter( req1, res1 );

    // next request should carry the cookie
    ClientRequestContext req2 = mock( ClientRequestContext.class );
    when( req2.getUri() ).thenReturn( URI.create( "http://localhost:8080/pentaho/api/repo/files/import" ) );
    MultivaluedMap<String, Object> reqHeaders = new MultivaluedHashMap<>();
    when( req2.getHeaders() ).thenReturn( reqHeaders );
    filter.filter( req2 );

    Object cookie = reqHeaders.getFirst( "Cookie" );
    assertNotNull( "second request must carry the stored cookie", cookie );
    assertTrue( cookie.toString().contains( "JSESSIONID=ABC123" ) );
  }

  @Test
  public void noCookieHeaderWhenNothingStored() throws Exception {
    SessionCookiesFilter filter = new SessionCookiesFilter();
    ClientRequestContext req = mock( ClientRequestContext.class );
    when( req.getUri() ).thenReturn( URL );
    MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();
    when( req.getHeaders() ).thenReturn( headers );

    filter.filter( req );
    assertTrue( headers.isEmpty() );
  }
}
