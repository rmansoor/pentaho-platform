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

import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.util.Set;

/**
 * Entry point for making a request body re-readable. {@link #wrap(HttpServletRequest)} returns a
 * {@link MultiReadHttpServletRequestWrapper} when the request's method is one of the buffer-eligible
 * methods and the request is not already wrapped; otherwise it returns the request unchanged.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.service.util.ManagedBodyServletRequestWrapper}.
 */
public final class ManagedBodyServletRequestWrapper {

  private ManagedBodyServletRequestWrapper() {
  }

  public static HttpServletRequest wrap( HttpServletRequest request ) {
    return wrap( request, HttpUtil.DEFAULT_PARSE_BODY_METHODS );
  }

  public static HttpServletRequest wrap( HttpServletRequest request, Set<String> parseBodyMethods ) {
    if ( request == null ) {
      return null;
    }
    if ( findMultiRead( request ) != null ) {
      return request;
    }
    String method = request.getMethod();
    if ( method == null || !parseBodyMethods.contains( method.toUpperCase( java.util.Locale.ROOT ) ) ) {
      return request;
    }
    if ( HttpUtil.isRequestMultipartFormData( request ) ) {
      // leave multipart alone — token travels in the X-CSRF-TOKEN header for those endpoints
      return request;
    }
    return new MultiReadHttpServletRequestWrapper( request, parseBodyMethods );
  }

  /** The multi-read wrapper in the chain, or {@code null}. */
  public static MultiReadHttpServletRequestWrapper findMultiRead( ServletRequest request ) {
    ServletRequest current = request;
    while ( current instanceof HttpServletRequestWrapper ) {
      if ( current instanceof MultiReadHttpServletRequestWrapper ) {
        return (MultiReadHttpServletRequestWrapper) current;
      }
      current = ( (HttpServletRequestWrapper) current ).getRequest();
    }
    return null;
  }

  /** Unwrap a not-yet-consumed multi-read wrapper so downstream sees the original request. */
  public static ServletRequest unwrap( ServletRequest request ) {
    if ( request instanceof MultiReadHttpServletRequestWrapper ) {
      return ( (HttpServletRequestWrapper) request ).getRequest();
    }
    return request;
  }
}
