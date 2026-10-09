import { AppError } from "../errors/AppError.js";
import { supabase } from "../db/supabase.js";

export const requireAdmin = async (req, _res, next) => {
  try {
    const authorization = req.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null;

    if (!token) {
      throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new AppError(
        "The authentication token is invalid or expired",
        401,
        "AUTH_REQUIRED",
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("crm_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      throw new AppError(
        "Administrator access is required",
        403,
        "ADMIN_REQUIRED",
      );
    }

    req.auth = { user, profile };
    return next();
  } catch (error) {
    return next(error);
  }
};
