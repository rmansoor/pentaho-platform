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

package org.pentaho.platform.security.web.servlet.csrf;

import jakarta.servlet.http.HttpServletRequest;
import org.pentaho.platform.security.web.model.csrf.CsrfConfiguration;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Bridges a Helix {@link CsrfConfiguration} to Spring Security's
 * {@link org.springframework.security.web.util.matcher.RequestMatcher}, so it can be handed to
 * {@link org.springframework.security.web.csrf.CsrfFilter#setRequireCsrfProtectionMatcher}.
 * <p>
 * Clean-room replacement for
 * {@code com.hitachivantara.security.web.impl.model.spring.CsrfRequiredRequestMatcherAdapter}.
 */
public class CsrfRequiredRequestMatcherAdapter implements RequestMatcher {

  private final CsrfConfiguration configuration;

  public CsrfRequiredRequestMatcherAdapter( CsrfConfiguration configuration ) {
    this.configuration = configuration;
  }

  @Override
  public boolean matches( HttpServletRequest request ) {
    return configuration != null && configuration.isEnabled( request );
  }
}
