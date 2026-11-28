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

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/**
 * Serves the Helix console's pages. The console is a single-page app in {@code /console/}: its router
 * owns addresses such as {@code /console/datasets/new}, which are not files, so a refresh, a bookmark
 * or a link to one would otherwise be a 404. A GET for an address under {@code /console/} whose last
 * part has no file extension, {@code /console/} itself included (the webapp's welcome files don't list
 * {@code index.html}), is forwarded to {@code /console/index.html}; files ({@code assets/…},
 * {@code favicon.svg}) are served as they are.
 * <p>
 * The page itself is sent with {@code Cache-Control: no-cache}, so browsers check for a new one after
 * an upgrade; the assets it loads carry a content hash in their names and can be cached for good.
 * <p>
 * Does nothing when the console isn't installed (no {@code /console/index.html}).
 */
public class ConsolePageFilter implements Filter {

  static final String PREFIX = "/console/";
  static final String PAGE = PREFIX + "index.html";

  private ServletContext context;

  @Override
  public void init( FilterConfig config ) {
    context = config.getServletContext();
  }

  @Override
  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
    throws IOException, ServletException {
    HttpServletRequest req = (HttpServletRequest) request;
    String path = req.getRequestURI().substring( req.getContextPath().length() );
    boolean read = "GET".equals( req.getMethod() ) || "HEAD".equals( req.getMethod() );
    if ( !read || !path.startsWith( PREFIX ) || context.getResource( PAGE ) == null ) {
      chain.doFilter( request, response );
      return;
    }
    String rest = path.substring( PREFIX.length() );
    if ( rest.equals( "index.html" ) ) {
      noCache( response );
      chain.doFilter( request, response );
    } else if ( isPage( rest ) ) {
      noCache( response );
      req.getRequestDispatcher( PAGE ).forward( request, response );
    } else {
      chain.doFilter( request, response );
    }
  }

  /** A router address: its last part has no extension ({@code datasets/new}, not {@code assets/app.js}). */
  static boolean isPage( String rest ) {
    String last = rest.substring( rest.lastIndexOf( '/' ) + 1 );
    return !last.contains( "." ) && !rest.startsWith( "assets/" );
  }

  private static void noCache( ServletResponse response ) {
    ( (HttpServletResponse) response ).setHeader( "Cache-Control", "no-cache" );
  }

  @Override
  public void destroy() {
    // Nothing held.
  }
}
