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

import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Buffers the request body so it can be read more than once &mdash; by a security filter that needs to
 * inspect it and then by the target servlet.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.util.MultiReadHttpServletRequestWrapper}.
 * <p>
 * For an {@code application/x-www-form-urlencoded} POST/PUT/PATCH, the container has typically already
 * consumed the stream while parsing parameters, so the body is reconstructed from the parameter map
 * (query-string parameters excluded). {@code multipart/form-data} is not buffered here &mdash; the CSRF
 * gate accepts the token via the {@code X-CSRF-TOKEN} header for those endpoints.
 */
public class MultiReadHttpServletRequestWrapper extends HttpServletRequestWrapper {

  private final Set<String> parseBodyMethods;
  private byte[] cachedBody;
  private Map<String, String[]> mergedParameters;

  public MultiReadHttpServletRequestWrapper( HttpServletRequest request ) {
    this( request, HttpUtil.DEFAULT_PARSE_BODY_METHODS );
  }

  public MultiReadHttpServletRequestWrapper( HttpServletRequest request, Set<String> parseBodyMethods ) {
    super( request );
    this.parseBodyMethods = parseBodyMethods;
    try {
      buffer();
    } catch ( IOException e ) {
      throw new UncheckedIOException( e );
    }
  }

  private void buffer() throws IOException {
    HttpServletRequest request = (HttpServletRequest) getRequest();

    if ( HttpUtil.isRequestPostFormUrlEncoded( request, parseBodyMethods ) ) {
      // container already parsed the body into parameters; rebuild it
      cachedBody = HttpUtil.getBodyFromServletRequestParameters( request ).toByteArray();
      return;
    }

    if ( HttpUtil.isRequestMultipartFormData( request ) ) {
      // not buffered — see class javadoc
      cachedBody = null;
      return;
    }

    // raw body (e.g. text/x-gwt-rpc, application/json): read and keep
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try ( ServletInputStream in = request.getInputStream() ) {
      byte[] buf = new byte[ 8192 ];
      int n;
      while ( ( n = in.read( buf ) ) != -1 ) {
        out.write( buf, 0, n );
      }
    }
    cachedBody = out.toByteArray();
  }

  public boolean isBodyBuffered() {
    return cachedBody != null;
  }

  private Charset charset() {
    String enc = getCharacterEncoding();
    try {
      return enc != null ? Charset.forName( enc ) : HttpUtil.FORM_CHARSET;
    } catch ( RuntimeException e ) {
      return HttpUtil.FORM_CHARSET;
    }
  }

  @Override
  public ServletInputStream getInputStream() throws IOException {
    if ( cachedBody == null ) {
      return super.getInputStream();
    }
    return new CachedServletInputStream( cachedBody );
  }

  @Override
  public BufferedReader getReader() throws IOException {
    if ( cachedBody == null ) {
      return super.getReader();
    }
    return new BufferedReader( new InputStreamReader( getInputStream(), charset() ) );
  }

  /* ---- parameters: query string + reconstructed form body ------------------------------------- */

  private Map<String, String[]> mergedParameters() {
    if ( mergedParameters != null ) {
      return mergedParameters;
    }
    Map<String, List<String>> acc = new LinkedHashMap<>();
    HttpUtil.parseQueryString( (HttpServletRequest) getRequest() )
      .forEach( ( k, vs ) -> acc.computeIfAbsent( k, x -> new ArrayList<>() ).addAll( java.util.Arrays.asList( vs ) ) );

    if ( cachedBody != null && HttpUtil.isRequestPostFormUrlEncoded(
      (HttpServletRequest) getRequest(), parseBodyMethods ) ) {
      String body = new String( cachedBody, HttpUtil.FORM_CHARSET );
      for ( String pair : body.split( "&" ) ) {
        if ( pair.isEmpty() ) {
          continue;
        }
        int eq = pair.indexOf( '=' );
        String k = java.net.URLDecoder.decode( eq >= 0 ? pair.substring( 0, eq ) : pair, HttpUtil.FORM_CHARSET );
        String v = java.net.URLDecoder.decode( eq >= 0 ? pair.substring( eq + 1 ) : "", HttpUtil.FORM_CHARSET );
        acc.computeIfAbsent( k, x -> new ArrayList<>() ).add( v );
      }
    } else {
      // no body params to add; fall back to the container's view for everything
      getRequest().getParameterMap().forEach( ( k, vs ) ->
        acc.putIfAbsent( k, new ArrayList<>( java.util.Arrays.asList( vs ) ) ) );
    }

    Map<String, String[]> out = new LinkedHashMap<>();
    acc.forEach( ( k, vs ) -> out.put( k, vs.toArray( new String[ 0 ] ) ) );
    mergedParameters = Collections.unmodifiableMap( out );
    return mergedParameters;
  }

  @Override
  public String getParameter( String name ) {
    String[] v = mergedParameters().get( name );
    return v != null && v.length > 0 ? v[ 0 ] : null;
  }

  @Override
  public String[] getParameterValues( String name ) {
    String[] v = mergedParameters().get( name );
    return v != null ? v.clone() : null;
  }

  @Override
  public Enumeration<String> getParameterNames() {
    return Collections.enumeration( mergedParameters().keySet() );
  }

  @Override
  public Map<String, String[]> getParameterMap() {
    return mergedParameters();
  }
}
