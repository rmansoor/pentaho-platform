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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Small HTTP helpers shared by the request wrappers and filters.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.service.util.HttpUtil}.
 */
public final class HttpUtil {

  /** HTTP methods for which a request body may be buffered so a filter can inspect it. */
  public static final Set<String> DEFAULT_PARSE_BODY_METHODS =
    Collections.unmodifiableSet( new LinkedHashSet<>( java.util.Arrays.asList( "POST", "PUT", "PATCH" ) ) );

  static final Charset FORM_CHARSET = StandardCharsets.UTF_8;
  private static final String FORM_URLENCODED = "application/x-www-form-urlencoded";
  private static final String MULTIPART = "multipart/form-data";

  private HttpUtil() {
  }

  public static <T> T nullTo( T value, T fallback ) {
    return value != null ? value : fallback;
  }

  private static String contentType( HttpServletRequest request ) {
    String ct = request.getContentType();
    return ct == null ? "" : ct.toLowerCase( Locale.ROOT );
  }

  private static String method( HttpServletRequest request ) {
    String m = request.getMethod();
    return m == null ? "" : m.toUpperCase( Locale.ROOT );
  }

  public static boolean isRequestPostFormUrlEncoded( HttpServletRequest request ) {
    return isRequestPostFormUrlEncoded( request, Collections.singleton( "POST" ) );
  }

  public static boolean isRequestPostFormUrlEncoded( HttpServletRequest request, Set<String> methods ) {
    return methods.contains( method( request ) ) && contentType( request ).startsWith( FORM_URLENCODED );
  }

  public static boolean isRequestMultipartFormData( HttpServletRequest request ) {
    return contentType( request ).startsWith( MULTIPART );
  }

  /**
   * Whether a request of this method may carry a body worth buffering.
   */
  public static boolean isRequestBodyAllowed( HttpServletRequest request ) {
    return DEFAULT_PARSE_BODY_METHODS.contains( method( request ) );
  }

  /**
   * Reconstruct an {@code application/x-www-form-urlencoded} body from a request's already-parsed
   * parameter map (query-string parameters excluded), so a wrapper can re-serve the body the container
   * consumed while parsing parameters.
   */
  public static ByteArrayOutputStream getBodyFromServletRequestParameters( HttpServletRequest request )
    throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream( 256 );
    writeBodyFromServletRequestParameters( request, out );
    return out;
  }

  public static void writeBodyFromServletRequestParameters( HttpServletRequest request, OutputStream out )
    throws IOException {
    Map<String, String[]> queryParams = parseQueryString( request );
    boolean first = true;
    for ( Map.Entry<String, String[]> e : request.getParameterMap().entrySet() ) {
      String name = e.getKey();
      String[] all = e.getValue();
      String[] query = queryParams.get( name );
      int skip = query == null ? 0 : query.length;
      for ( int i = skip; i < all.length; i++ ) {
        if ( !first ) {
          out.write( '&' );
        }
        first = false;
        out.write( URLEncoder.encode( name, FORM_CHARSET ).getBytes( FORM_CHARSET ) );
        out.write( '=' );
        out.write( URLEncoder.encode( all[ i ], FORM_CHARSET ).getBytes( FORM_CHARSET ) );
      }
    }
  }

  public static Map<String, String[]> parseQueryString( HttpServletRequest request ) {
    String qs = request.getQueryString();
    if ( qs == null || qs.isEmpty() ) {
      return Collections.emptyMap();
    }
    java.util.Map<String, java.util.List<String>> acc = new java.util.LinkedHashMap<>();
    for ( String pair : qs.split( "&" ) ) {
      if ( pair.isEmpty() ) {
        continue;
      }
      int eq = pair.indexOf( '=' );
      String k = eq >= 0 ? pair.substring( 0, eq ) : pair;
      String v = eq >= 0 ? pair.substring( eq + 1 ) : "";
      k = java.net.URLDecoder.decode( k, FORM_CHARSET );
      v = java.net.URLDecoder.decode( v, FORM_CHARSET );
      acc.computeIfAbsent( k, x -> new java.util.ArrayList<>() ).add( v );
    }
    java.util.Map<String, String[]> out = new java.util.LinkedHashMap<>();
    acc.forEach( ( k, vs ) -> out.put( k, vs.toArray( new String[ 0 ] ) ) );
    return out;
  }
}
