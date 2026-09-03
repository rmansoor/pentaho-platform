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

package org.pentaho.platform.security.web.model.csrf;

import jakarta.servlet.http.HttpServletRequest;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The single {@link CsrfConfiguration} the {@code csrfGateFilter} consumes. Collects every
 * {@link CsrfRequestSetConfiguration} published by the system and by plugins; a request needs CSRF
 * protection when {@link #isEnabled() enabled} <em>and</em> any collected set's matcher accepts it.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.model.csrf.AggregatedRequestSetCsrfConfiguration}.
 * <ul>
 *   <li>{@link #setRequestSetConfigurations(List)} — static wiring from the system Spring context.</li>
 *   <li>{@link #requestSetConfigurationDidBind}/{@link #requestSetConfigurationWillUnbind} — dynamic
 *       contribution as plugins publish/retract their configurations.</li>
 * </ul>
 */
public final class AggregatedRequestSetCsrfConfiguration implements CsrfConfiguration {

  private volatile boolean enabled;
  private final List<CsrfRequestSetConfiguration> configurations = new CopyOnWriteArrayList<>();

  @Override
  public boolean isEnabled() {
    return enabled;
  }

  public synchronized void setEnabled( boolean enabled ) {
    this.enabled = enabled;
  }

  @Override
  public boolean isEnabled( HttpServletRequest request ) {
    if ( !enabled || request == null ) {
      return false;
    }
    for ( CsrfRequestSetConfiguration configuration : configurations ) {
      if ( configuration != null && configuration.getRequestMatcher() != null
        && configuration.getRequestMatcher().test( request ) ) {
        return true;
      }
    }
    return false;
  }

  public synchronized void setRequestSetConfigurations( Collection<CsrfRequestSetConfiguration> configurations ) {
    this.configurations.clear();
    if ( configurations != null ) {
      for ( CsrfRequestSetConfiguration c : configurations ) {
        if ( c != null && !this.configurations.contains( c ) ) {
          this.configurations.add( c );
        }
      }
    }
  }

  public synchronized void requestSetConfigurationDidBind( CsrfRequestSetConfiguration configuration ) {
    if ( configuration != null && !configurations.contains( configuration ) ) {
      configurations.add( configuration );
    }
  }

  public synchronized void requestSetConfigurationWillUnbind( CsrfRequestSetConfiguration configuration ) {
    configurations.remove( configuration );
  }

  List<CsrfRequestSetConfiguration> getRequestSetConfigurations() {
    return new ArrayList<>( configurations );
  }
}
