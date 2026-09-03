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

package org.pentaho.platform.security.web.model.cors;

import jakarta.servlet.http.HttpServletRequest;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The {@link CorsConfiguration} the {@code corsFilter} consumes. Collects every
 * {@link CorsRequestSetConfiguration} published by the system and by plugins, forms them into an
 * inheritance tree rooted at the one named {@value CorsRequestSetConfiguration#ROOT_NAME}, and resolves
 * the effective configuration for a request by walking that tree.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.model.cors.AggregatedRequestSetCorsConfiguration}.
 * <p>
 * Resolution for a request: the first registered non-abstract configuration whose matcher accepts the
 * request, flattened against its parent chain (a child value wins; an unset child value is inherited);
 * or {@code null} when none applies.
 */
public class AggregatedRequestSetCorsConfiguration implements CorsConfiguration {

  private final List<CorsRequestSetConfiguration> configurations = new CopyOnWriteArrayList<>();

  @Override
  public CorsRequestSetConfiguration getRootConfiguration() {
    return findByName( CorsRequestSetConfiguration.ROOT_NAME );
  }

  @Override
  public CorsRequestSetConfiguration getRequestConfiguration( HttpServletRequest request ) {
    if ( request == null ) {
      return null;
    }

    // Specific (non-root) configurations first, in registration order; the root configuration is the
    // catch-all fallback, considered only after none of the specific ones apply.
    for ( CorsRequestSetConfiguration configuration : configurations ) {
      if ( isApplicable( configuration, request )
        && !CorsRequestSetConfiguration.ROOT_NAME.equals( configuration.getName() ) ) {
        return flatten( configuration );
      }
    }

    CorsRequestSetConfiguration root = getRootConfiguration();
    if ( isApplicable( root, request ) ) {
      return flatten( root );
    }
    return null;
  }

  private static boolean isApplicable( CorsRequestSetConfiguration c, HttpServletRequest request ) {
    return c != null
      && !c.isAbstract()
      && c.isEnabled()
      && c.getRequestMatcher() != null
      && c.getRequestMatcher().test( request );
  }

  /** Merge {@code config} with its parent chain — child value wins, unset child value inherited. */
  private CorsRequestSetConfiguration flatten( CorsRequestSetConfiguration config ) {
    List<CorsRequestSetConfiguration> chain = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    CorsRequestSetConfiguration current = config;
    while ( current != null && ( current.getName() == null || seen.add( current.getName() ) ) ) {
      chain.add( current );
      String parentName = current.getParentName();
      if ( parentName == null && !CorsRequestSetConfiguration.ROOT_NAME.equals( current.getName() ) ) {
        parentName = CorsRequestSetConfiguration.ROOT_NAME;
      }
      current = parentName == null ? null : findByName( parentName );
    }

    CorsRequestSetConfigurationPojo out = new CorsRequestSetConfigurationPojo();
    out.setName( config.getName() );
    out.setParentName( config.getParentName() );
    out.setRequestMatcher( config.getRequestMatcher() );
    out.setAbstract( false );
    out.setEnabled( true );

    // walk root -> leaf so nearer ancestors override
    for ( int i = chain.size() - 1; i >= 0; i-- ) {
      CorsRequestSetConfiguration c = chain.get( i );
      if ( !isEmpty( c.getAllowedOrigins() ) ) {
        out.setAllowedOrigins( c.getAllowedOrigins() );
      }
      if ( !isEmpty( c.getAllowedMethods() ) ) {
        out.setAllowedMethods( c.getAllowedMethods() );
      }
      if ( !isEmpty( c.getAllowedHeaders() ) ) {
        out.setAllowedHeaders( c.getAllowedHeaders() );
      }
      if ( !isEmpty( c.getExposedHeaders() ) ) {
        out.setExposedHeaders( c.getExposedHeaders() );
      }
      if ( c.getAllowCredentials() != null ) {
        out.setAllowCredentials( c.getAllowCredentials() );
      }
      if ( c.getMaxAge() != null ) {
        out.setMaxAge( c.getMaxAge() );
      }
    }
    return out;
  }

  private static boolean isEmpty( Set<String> s ) {
    return s == null || s.isEmpty();
  }

  private CorsRequestSetConfiguration findByName( String name ) {
    if ( name == null ) {
      return null;
    }
    for ( CorsRequestSetConfiguration c : configurations ) {
      if ( c != null && name.equals( c.getName() ) ) {
        return c;
      }
    }
    return null;
  }

  public synchronized void setRequestSetConfigurations( Collection<CorsRequestSetConfiguration> configurations ) {
    this.configurations.clear();
    if ( configurations != null ) {
      for ( CorsRequestSetConfiguration c : configurations ) {
        if ( c != null && !this.configurations.contains( c ) ) {
          this.configurations.add( c );
        }
      }
    }
  }

  public synchronized void requestSetConfigurationDidBind( CorsRequestSetConfiguration configuration ) {
    if ( configuration != null && !configurations.contains( configuration ) ) {
      configurations.add( configuration );
    }
  }

  public synchronized void requestSetConfigurationWillUnbind( CorsRequestSetConfiguration configuration ) {
    configurations.remove( configuration );
  }

  List<CorsRequestSetConfiguration> getRequestSetConfigurations() {
    return new ArrayList<>( configurations );
  }
}
