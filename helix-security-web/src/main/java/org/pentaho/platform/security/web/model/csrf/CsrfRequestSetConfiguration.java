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

import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

/**
 * One contributed set of CSRF-protected requests. The system and each plugin may publish any number of
 * these; {@link CsrfConfiguration} aggregates them.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.csrf.CsrfRequestSetConfiguration}.
 */
public interface CsrfRequestSetConfiguration {

  RequestMatcher getRequestMatcher();
}
