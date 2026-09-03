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

package org.pentaho.platform.security.web.model.ssrf;

import java.net.URI;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Plain {@link SsrfConfiguration} holder.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.model.ssrf.SsrfConfigurationPojo}.
 * {@code org.pentaho.platform.config.PentahoSsrfConfigurationPojo} subclasses this to build the origin
 * set from {@code fully-qualified-server-url} + {@code alternative-fully-qualified-server-urls}.
 */
public class SsrfConfigurationPojo implements SsrfConfiguration {

  private final Set<URI> allowedOrigins;
  private final boolean enabled;

  public SsrfConfigurationPojo( Set<URI> allowedOrigins, boolean enabled ) {
    this.allowedOrigins = allowedOrigins == null
      ? Collections.emptySet()
      : Collections.unmodifiableSet( new LinkedHashSet<>( allowedOrigins ) );
    this.enabled = enabled;
  }

  @Override
  public boolean isEnabled() {
    return enabled;
  }

  @Override
  public Set<URI> getAllowedOrigins() {
    return allowedOrigins;
  }
}
