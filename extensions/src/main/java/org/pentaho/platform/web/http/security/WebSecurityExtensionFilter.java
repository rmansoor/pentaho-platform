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
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.pentaho.platform.api.engine.IPluginManager;
import org.pentaho.platform.engine.core.system.PentahoSystem;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * The "web-security" slot at the head of every filter chain of {@code filterChainProxy}.
 * <p>
 * Helix CE ships no web-security enforcement (SSRF / CSRF / CORS). This filter is a pass-through
 * unless a plugin publishes one or more {@link Filter}s into the slot, e.g. the Helix Security Web
 * plugin:
 * <pre>{@code
 * <pen:publish as-type="jakarta.servlet.Filter">
 *   <pen:attributes><pen:attr key="helix.filter-slot" value="web-security"/></pen:attributes>
 * </pen:publish>
 * }</pre>
 * Published filters run in {@link PentahoSystem#getAll} order (publish priority), before the rest
 * of the chain.
 * <p>
 * The filter list is looked up per request until the platform reports a successful start, then
 * cached, and the cache is dropped whenever the plugin manager reloads.
 */
public class WebSecurityExtensionFilter implements Filter {

  public static final String SLOT_ATTRIBUTE = "helix.filter-slot";
  public static final String SLOT_WEB_SECURITY = "web-security";

  private static final Log logger = LogFactory.getLog( WebSecurityExtensionFilter.class );

  private final Supplier<List<Filter>> lookup;
  private final Supplier<Boolean> cacheable;

  private volatile List<Filter> cached;
  private volatile boolean listening;

  public WebSecurityExtensionFilter() {
    this(
      () -> PentahoSystem.getAll( Filter.class, null, Map.of( SLOT_ATTRIBUTE, SLOT_WEB_SECURITY ) ),
      PentahoSystem::getInitializedOK );
  }

  /** Test seam. */
  WebSecurityExtensionFilter( Supplier<List<Filter>> lookup, Supplier<Boolean> cacheable ) {
    this.lookup = lookup;
    this.cacheable = cacheable;
  }

  @Override
  public void doFilter( ServletRequest request, ServletResponse response, FilterChain chain )
    throws IOException, ServletException {

    List<Filter> filters = getFilters();
    if ( filters.isEmpty() ) {
      chain.doFilter( request, response );
      return;
    }

    new SlotChain( filters, chain ).doFilter( request, response );
  }

  List<Filter> getFilters() {
    List<Filter> current = cached;
    if ( current != null ) {
      return current;
    }

    List<Filter> resolved = resolve();
    if ( Boolean.TRUE.equals( cacheable.get() ) ) {
      listenForPluginReloads();
      cached = resolved;
      if ( logger.isInfoEnabled() ) {
        logger.info( resolved.isEmpty()
          ? "web-security slot is empty: no SSRF/CSRF/CORS enforcement installed"
          : "web-security slot: " + resolved.size() + " filter(s) installed " + resolved );
      }
    }
    return resolved;
  }

  /** Drops the cached filter list; the next request looks it up again. */
  void invalidate() {
    cached = null;
  }

  private List<Filter> resolve() {
    try {
      List<Filter> filters = lookup.get();
      return filters == null ? Collections.emptyList() : List.copyOf( filters );
    } catch ( RuntimeException e ) {
      logger.error( "Could not look up web-security filters", e );
      throw e;
    }
  }

  private void listenForPluginReloads() {
    if ( listening ) {
      return;
    }
    synchronized ( this ) {
      if ( listening ) {
        return;
      }
      IPluginManager pluginManager = PentahoSystem.get( IPluginManager.class );
      if ( pluginManager != null ) {
        pluginManager.addPluginManagerListener( this::invalidate );
      }
      listening = true;
    }
  }

  private static final class SlotChain implements FilterChain {
    private final List<Filter> filters;
    private final FilterChain next;
    private int position;

    SlotChain( List<Filter> filters, FilterChain next ) {
      this.filters = filters;
      this.next = next;
    }

    @Override
    public void doFilter( ServletRequest request, ServletResponse response ) throws IOException, ServletException {
      if ( position < filters.size() ) {
        filters.get( position++ ).doFilter( request, response, this );
      } else {
        next.doFilter( request, response );
      }
    }
  }
}
