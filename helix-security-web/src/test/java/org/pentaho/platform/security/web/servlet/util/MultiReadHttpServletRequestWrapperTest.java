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

package org.pentaho.platform.security.web.servlet.util;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

public class MultiReadHttpServletRequestWrapperTest {

  private static final String BODY = "[{\"fullPath\":\"/public/a.xcdf\",\"title\":\"A\"}]";

  private static HttpServletRequest jsonPost( String body ) {
    MockHttpServletRequest request = new MockHttpServletRequest( "POST", "/api/user-settings/favorites" );
    request.setContentType( "application/json" );
    request.setContent( body.getBytes( StandardCharsets.UTF_8 ) );
    return request;
  }

  private static String readAll( InputStream in ) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[ 8 ];
    int n;
    while ( ( n = in.read( buf ) ) != -1 ) {
      out.write( buf, 0, n );
    }
    return out.toString( StandardCharsets.UTF_8 );
  }

  /**
   * Jersey's servlet bridge calls {@code request.getInputStream()} for every read. The wrapper must
   * hand back the same stream while it is being consumed; a fresh stream per call replays the body
   * forever (seen live as {@code OutOfMemoryError: Required array size too large} on
   * {@code POST /api/user-settings/favorites} with CSRF on).
   */
  @Test( timeout = 5000 )
  public void repeatedGetInputStreamDuringOneReadDoesNotReplayTheBody() throws Exception {
    MultiReadHttpServletRequestWrapper wrapper = new MultiReadHttpServletRequestWrapper( jsonPost( BODY ) );

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[ 8 ];
    int n;
    while ( ( n = wrapper.getInputStream().read( buf ) ) != -1 ) {
      out.write( buf, 0, n );
      assertTrue( "body replayed", out.size() <= BODY.length() );
    }
    assertEquals( BODY, out.toString( StandardCharsets.UTF_8 ) );
  }

  @Test
  public void sameStreamWhileUnfinished() throws Exception {
    MultiReadHttpServletRequestWrapper wrapper = new MultiReadHttpServletRequestWrapper( jsonPost( BODY ) );
    assertSame( wrapper.getInputStream(), wrapper.getInputStream() );
  }

  /** A filter (e.g. the GWT-RPC CSRF matcher) reads the body, then the servlet reads it again. */
  @Test
  public void bodyCanBeReadAgainAfterAFullRead() throws Exception {
    MultiReadHttpServletRequestWrapper wrapper = new MultiReadHttpServletRequestWrapper( jsonPost( BODY ) );
    assertEquals( BODY, readAll( wrapper.getInputStream() ) );
    assertEquals( BODY, readAll( wrapper.getInputStream() ) );
  }

  @Test( timeout = 5000 )
  public void repeatedGetReaderDuringOneReadDoesNotReplayOrLoseData() throws Exception {
    MultiReadHttpServletRequestWrapper wrapper = new MultiReadHttpServletRequestWrapper( jsonPost( BODY ) );

    StringBuilder sb = new StringBuilder();
    char[] buf = new char[ 8 ];
    int n;
    while ( ( n = wrapper.getReader().read( buf ) ) != -1 ) {
      sb.append( buf, 0, n );
      assertTrue( "body replayed", sb.length() <= BODY.length() );
    }
    assertEquals( BODY, sb.toString() );

    BufferedReader again = wrapper.getReader();
    assertEquals( BODY, again.readLine() );
  }

  @Test
  public void emptyBody() throws Exception {
    MultiReadHttpServletRequestWrapper wrapper = new MultiReadHttpServletRequestWrapper( jsonPost( "" ) );
    assertEquals( -1, wrapper.getInputStream().read() );
    assertEquals( "", readAll( wrapper.getInputStream() ) );
  }
}
