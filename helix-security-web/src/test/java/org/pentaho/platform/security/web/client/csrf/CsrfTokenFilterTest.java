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

package org.pentaho.platform.security.web.client.csrf;

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientRequestContext;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import org.junit.Test;

import java.net.URI;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class CsrfTokenFilterTest {

  private static final URI TOKEN_URI = URI.create( "http://localhost:8080/pentaho/api/csrf/token" );

  private static ClientRequestContext ctx( String method, String uri, MultivaluedMap<String, Object> headers ) {
    ClientRequestContext c = mock( ClientRequestContext.class );
    when( c.getMethod() ).thenReturn( method );
    when( c.getUri() ).thenReturn( URI.create( uri ) );
    when( c.getHeaders() ).thenReturn( headers );
    when( c.getClient() ).thenReturn( mock( Client.class ) );
    return c;
  }

  /** A filter whose service client always returns a fixed token. */
  private static CsrfTokenFilter filterReturning( CsrfToken token ) {
    return new CsrfTokenFilter( TOKEN_URI ) {
      @Override
      CsrfTokenServiceClient getServiceClient( Client client ) {
        return new CsrfTokenServiceClient( client, TOKEN_URI ) {
          @Override
          CsrfToken getToken( URI targetUri ) {
            return token;
          }
        };
      }
    };
  }

  @Test
  public void addsTokenHeaderToUnsafeRequest() {
    MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();
    filterReturning( new CsrfToken( "X-CSRF-TOKEN", "_csrf", "tok-123" ) )
      .filter( ctx( "POST", "http://localhost:8080/pentaho/api/repo/files/import", headers ) );

    assertEquals( "tok-123", headers.getFirst( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void leavesSafeRequestAlone() {
    MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();
    filterReturning( new CsrfToken( "X-CSRF-TOKEN", "_csrf", "tok-123" ) )
      .filter( ctx( "GET", "http://localhost:8080/pentaho/api/repo/files/children", headers ) );

    assertFalse( headers.containsKey( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void doesNotRecurseIntoTheTokenEndpoint() {
    MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();
    filterReturning( new CsrfToken( "X-CSRF-TOKEN", "_csrf", "tok-123" ) )
      .filter( ctx( "GET", TOKEN_URI.toString(), headers ) );

    assertFalse( headers.containsKey( "X-CSRF-TOKEN" ) );
  }

  @Test
  public void toleratesAnEndpointThatReturnsNoToken() {
    MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();
    filterReturning( null )
      .filter( ctx( "POST", "http://localhost:8080/pentaho/api/repo/files/import", headers ) );

    assertFalse( headers.containsKey( "X-CSRF-TOKEN" ) );
  }
}
