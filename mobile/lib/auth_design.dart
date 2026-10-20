import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const ink = Color(0xFF0C1046);
const paper = Colors.white;
const muted = Color(0xFF7483B5);
const teal = Color(0xFF007D80);
const fieldBorder = Color(0xFFD4DCF2);
const tealWash = Color(0xFFF0FAFA);

ThemeData orwickleTheme() => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: paper,
  fontFamily: 'PlusJakartaSans',
  colorScheme: ColorScheme.fromSeed(
    seedColor: teal,
    primary: teal,
    onPrimary: Colors.white,
    surface: paper,
    onSurface: ink,
    error: const Color(0xFFB43B45),
  ),
  textTheme: const TextTheme(
    bodyLarge: TextStyle(color: ink, fontSize: 15),
    bodyMedium: TextStyle(color: ink, fontSize: 14),
    titleLarge: TextStyle(color: ink, fontWeight: FontWeight.w700),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: Colors.white,
    hintStyle: const TextStyle(color: muted, fontSize: 14),
    contentPadding: const EdgeInsets.symmetric(horizontal: 17, vertical: 17),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(9)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(9),
      borderSide: const BorderSide(color: fieldBorder),
    ),
    disabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(9),
      borderSide: const BorderSide(color: fieldBorder),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(9),
      borderSide: const BorderSide(color: teal, width: 1.3),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(9),
      borderSide: const BorderSide(color: Color(0xFFB43B45)),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(9),
      borderSide: const BorderSide(color: Color(0xFFB43B45), width: 1.3),
    ),
    errorMaxLines: 2,
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(
      foregroundColor: teal,
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      minimumSize: const Size(48, 44),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size.fromHeight(54),
      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: teal,
      minimumSize: const Size.fromHeight(50),
      side: const BorderSide(color: fieldBorder),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
    ),
  ),
  dividerTheme: const DividerThemeData(
    color: fieldBorder,
    thickness: 1,
    space: 1,
  ),
);

class OrwickleBrand extends StatelessWidget {
  final VoidCallback? onLongPress;
  const OrwickleBrand({super.key, this.onLongPress});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onLongPress: onLongPress,
    behavior: HitTestBehavior.opaque,
    child: Semantics(
      label: 'Orwickle',
      excludeSemantics: true,
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 37,
            height: 37,
            child: CustomPaint(painter: _OrwickleMarkPainter()),
          ),
          SizedBox(width: 9),
          Text(
            'Orwickle',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              letterSpacing: -1.2,
              color: ink,
            ),
          ),
        ],
      ),
    ),
  );
}

class _OrwickleMarkPainter extends CustomPainter {
  const _OrwickleMarkPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 40, size.height / 40);
    canvas.clipPath(Path()..addOval(const Rect.fromLTWH(0, 0, 40, 40)));
    const palettes = [
      [Color(0xFF009A99), Color(0xFF006E78)],
      [Color(0xFF11194E), Color(0xFF06394F)],
      [Color(0xFF00A2A0), Color(0xFF007A7E)],
    ];
    for (var i = 0; i < 3; i++) {
      canvas.save();
      canvas.translate(20, 20);
      canvas.rotate(i * 2 * math.pi / 3);
      canvas.translate(-20, -20);
      final blade = Path()
        ..moveTo(20, 0.4)
        ..cubicTo(8, 0.4, 0.4, 9, 0.4, 20.5)
        ..cubicTo(0.4, 30, 7, 37.5, 16.8, 39.2)
        ..cubicTo(9.3, 33.8, 8.8, 25.4, 13.1, 18.4)
        ..cubicTo(17.2, 11.7, 26, 9.4, 34.9, 13.6)
        ..cubicTo(31.2, 4.6, 26.4, 0.4, 20, 0.4)
        ..close();
      canvas.drawPath(
        blade,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: palettes[i],
          ).createShader(const Rect.fromLTWH(0, 0, 40, 40)),
      );
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class AuthPrimaryButton extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  const AuthPrimaryButton({
    super.key,
    required this.label,
    this.busy = false,
    this.onPressed,
  });
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xFF00888A), Color(0xFF006D73)],
      ),
      borderRadius: BorderRadius.circular(9),
      boxShadow: const [
        BoxShadow(
          color: Color(0x10007479),
          blurRadius: 7,
          offset: Offset(0, 2),
        ),
      ],
    ),
    child: FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: Colors.transparent,
        disabledBackgroundColor: Colors.transparent,
        shadowColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 22),
      ),
      child: busy
          ? const SizedBox(
              width: 21,
              height: 21,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
                semanticsLabel: 'Please wait',
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(child: Text(label, textAlign: TextAlign.center)),
                const SizedBox(width: 18),
                const Icon(Icons.arrow_forward_rounded, size: 22),
              ],
            ),
    ),
  );
}

class AuthRolePicker extends StatelessWidget {
  final String selected;
  final ValueChanged<String>? onChanged;
  const AuthRolePicker({super.key, required this.selected, this.onChanged});
  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final (index, role) in ['student', 'investor', 'buyer'].indexed) ...[
        if (index > 0) const SizedBox(width: 10),
        Expanded(child: _roleCard(role)),
      ],
    ],
  );
  Widget _roleCard(String role) {
    final active = selected == role;
    final label = '${role[0].toUpperCase()}${role.substring(1)}';
    return Semantics(
      button: true,
      selected: active,
      enabled: onChanged != null,
      inMutuallyExclusiveGroup: true,
      onTap: onChanged == null ? null : () => onChanged!(role),
      label: label,
      excludeSemantics: true,
      child: Material(
        color: active ? tealWash : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(9),
          side: BorderSide(color: active ? teal : fieldBorder),
        ),
        child: InkWell(
          key: ValueKey('role-$role'),
          borderRadius: BorderRadius.circular(9),
          onTap: onChanged == null ? null : () => onChanged!(role),
          child: SizedBox(
            height: 98,
            child: Stack(
              children: [
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    width: 15,
                    height: 15,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: active ? const Color(0xFF8CC9CA) : muted,
                        width: 1.5,
                      ),
                    ),
                    child: active
                        ? Center(
                            child: Container(
                              width: 9,
                              height: 9,
                              decoration: const BoxDecoration(
                                color: teal,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                        : null,
                  ),
                ),
                Center(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          switch (role) {
                            'student' => Icons.school_outlined,
                            'investor' => Icons.bar_chart_outlined,
                            _ => Icons.shopping_cart_outlined,
                          },
                          size: 29,
                          color: active ? teal : ink,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          label,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: active ? teal : ink,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One native input retains paste, backspace, selection and OTP autofill behavior.
/// The six decorative cells are excluded from accessibility to avoid duplicate inputs.
class OtpCodeField extends StatefulWidget {
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onSubmitted;
  const OtpCodeField({
    super.key,
    required this.controller,
    required this.onSubmitted,
    this.enabled = true,
  });
  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  final focus = FocusNode();
  double lastTap = 0;
  @override
  void initState() {
    super.initState();
    focus.addListener(refresh);
  }

  void refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    focus.removeListener(refresh);
    focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormField<String>(
    validator: (_) =>
        widget.controller.text.length == 6 ? null : 'Enter the six-digit code.',
    builder: (field) => LayoutBuilder(
      builder: (context, constraints) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 60,
            child: ValueListenableBuilder<TextEditingValue>(
              valueListenable: widget.controller,
              builder: (context, value, _) => Stack(
                children: [
                  Positioned.fill(
                    child: IgnorePointer(
                      child: ExcludeSemantics(
                        child: Row(
                          children: [
                            for (var i = 0; i < 6; i++) ...[
                              if (i > 0) const SizedBox(width: 8),
                              Expanded(
                                child: Container(
                                  key: ValueKey('otp-cell-$i'),
                                  height: 60,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color:
                                        focus.hasFocus &&
                                            value.selection.baseOffset.clamp(
                                                  0,
                                                  5,
                                                ) ==
                                                i
                                        ? tealWash
                                        : Colors.white,
                                    border: Border.all(
                                      color: field.hasError
                                          ? const Color(0xFFB43B45)
                                          : focus.hasFocus &&
                                                value.selection.baseOffset
                                                        .clamp(0, 5) ==
                                                    i
                                          ? teal
                                          : fieldBorder,
                                      width: 1,
                                    ),
                                    borderRadius: BorderRadius.circular(9),
                                  ),
                                  child: i < value.text.length
                                      ? Text(
                                          value.text[i],
                                          style: const TextStyle(
                                            fontSize: 24,
                                            fontWeight: FontWeight.w500,
                                            color: ink,
                                          ),
                                        )
                                      : focus.hasFocus &&
                                            value.selection.baseOffset.clamp(
                                                  0,
                                                  5,
                                                ) ==
                                                i
                                      ? Container(
                                          width: 1.5,
                                          height: 23,
                                          color: ink,
                                        )
                                      : null,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: Listener(
                      onPointerDown: (event) =>
                          lastTap = event.localPosition.dx,
                      child: Semantics(
                        label: 'Email verification code',
                        child: TextField(
                          key: const ValueKey('otp-input'),
                          controller: widget.controller,
                          focusNode: focus,
                          enabled: widget.enabled,
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(6),
                          ],
                          autocorrect: false,
                          enableSuggestions: false,
                          showCursor: false,
                          style: const TextStyle(
                            color: Colors.transparent,
                            fontSize: 22,
                          ),
                          cursorColor: Colors.transparent,
                          decoration: const InputDecoration(
                            fillColor: Colors.transparent,
                            filled: true,
                            contentPadding: EdgeInsets.symmetric(vertical: 15),
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            disabledBorder: InputBorder.none,
                          ),
                          onChanged: field.didChange,
                          onTapAlwaysCalled: true,
                          onTap: () {
                            final cell =
                                (lastTap / ((constraints.maxWidth + 8) / 6))
                                    .floor()
                                    .clamp(0, widget.controller.text.length);
                            widget.controller.selection =
                                TextSelection.collapsed(offset: cell);
                          },
                          onSubmitted: (_) => widget.onSubmitted(),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (field.hasError)
            Padding(
              padding: const EdgeInsets.only(top: 9, left: 3),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  field.errorText!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFFB43B45),
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
