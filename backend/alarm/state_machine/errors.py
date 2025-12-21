from __future__ import annotations


class TransitionError(RuntimeError):
    pass


class CodeRequiredError(TransitionError):
    pass


class InvalidCodeError(TransitionError):
    pass

